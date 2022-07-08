import { Probot } from 'probot';
import { Router } from 'express';
import { exposeMetrics, useCounter } from '@operate-first/probot-metrics';
import {
  APIS,
  createTokenSecret,
  deleteTokenSecret,
  getNamespace,
  getTokenSecretName,
  updateTokenSecret,
  useApi,
} from '@operate-first/probot-kubernetes';
import { parse } from '@open-service-group/probot-issue-form';

const generateTaskPayload = (name: string, context: any) => ({
  apiVersion: 'tekton.dev/v1beta1',
  kind: 'TaskRun',
  metadata: {
    // "{{name}}" to match the prefix in manifests/base/tasks/kustomization.yaml namePrefix
    // (not necessary for functionality, just for consistency)
    generateName: `{{name}}-${name}-`,
  },
  spec: {
    taskRef: {
      // "{{name}}" to match the prefix in manifests/base/tasks/kustomization.yaml namePrefix
      // necessary for functionality
      name: '{{name}}-' + name,
    },
    params: [
      {
        name: 'SECRET_NAME',
        value: getTokenSecretName(context),
      },
      {
        name: 'CONTEXT',
        value: JSON.stringify(context.payload),
      },
    ],
  },
});

export default (
  app: Probot,
  {
    getRouter,
  }: { getRouter?: ((path?: string | undefined) => Router) | undefined }
) => {
  // Expose additional routes for /healthz and /metrics
  if (!getRouter) {
    app.log.error('Missing router.');
    return;
  }
  const router = getRouter();
  router.get('/healthz', (_, response) => response.status(200).send('OK'));
  exposeMetrics(router, '/metrics');

  // Register tracked metrics
  const numberOfInstallTotal = useCounter({
    name: 'num_of_install_total',
    help: 'Total number of installs received',
    labelNames: [],
  });
  const numberOfUninstallTotal = useCounter({
    name: 'num_of_uninstall_total',
    help: 'Total number of uninstalls received',
    labelNames: [],
  });
  const numberOfActionsTotal = useCounter({
    name: 'num_of_actions_total',
    help: 'Total number of actions received',
    labelNames: ['install', 'action'],
  });
  const operationsTriggered = useCounter({
    name: 'operations_triggered',
    help: 'Metrics for action triggered by the operator with respect to the kubernetes operations.',
    labelNames: ['install', 'operation', 'status', 'method'],
  });

  //From peribolos app.ts
  const createTaskRun = (
    name: string,
    context: any,
    extraParams: Array<Record<string, unknown>> = []
  ) => {
    const params = [
      {
        name: 'SECRET_NAME',
        value: getTokenSecretName(context),
      },
      ...extraParams,
    ];
    const taskRunpayload = {
      apiVersion: 'tekton.dev/v1beta1',
      kind: 'TaskRun',
      metadata: {
        generateName: name + '-',
      },
      spec: {
        taskRef: {
          name,
        },
        params: params,
      },
    };

    wrapOperationWithMetrics(
      useApi(APIS.CustomObjectsApi).createNamespacedCustomObject(
        'tekton.dev',
        'v1beta1',
        getNamespace(),
        'taskruns',
        taskRunpayload
      ),
      {
        install: context.payload.installation.id,
        method: name,
      }
    );
  };

  // Simple callback wrapper - executes and async operation and based on the result it inc() operationsTriggered counted
  const wrapOperationWithMetrics = (callback: Promise<any>, labels: any) => {
    const response = callback
      .then(() => ({
        status: 'Succeeded',
      }))
      .catch(() => ({
        status: 'Failed',
      }));

    operationsTriggered
      .labels({
        ...labels,
        ...response,
        operation: 'k8s',
      })
      .inc();
  };

  app.onAny((context: any) => {
    // On any event inc() the counter
    numberOfActionsTotal
      .labels({
        install: context.payload.installation.id,
        action: context.payload.action,
      })
      .inc();
  });

  app.on('installation.created', async (context: any) => {
    numberOfInstallTotal.labels({}).inc();

    // Create secret holding the access token
    wrapOperationWithMetrics(createTokenSecret(context), {
      install: context.payload.installation.id,
      method: 'createSecret',
    });
  });

  app.on('push', async (context: any) => {
    // Update token in case it expired
    wrapOperationWithMetrics(updateTokenSecret(context), {
      install: context.payload.installation.id,
      method: 'updateSecret',
    });

    // Trigger example taskrun
    wrapOperationWithMetrics(
      useApi(APIS.CustomObjectsApi).createNamespacedCustomObject(
        'tekton.dev',
        'v1beta1',
        getNamespace(),
        'taskruns',
        generateTaskPayload('example', context)
      ),
      {
        install: context.payload.installation.id,
        method: 'scheduleExampleTaskRun',
      }
    );
  });

  app.on('installation.deleted', async (context: any) => {
    numberOfUninstallTotal.labels({}).inc();

    // Delete secret containing the token
    wrapOperationWithMetrics(deleteTokenSecret(context), {
      install: context.payload.installation.id,
      method: 'deleteSecret',
    });
  });

  app.on("issues", async(context: any) => {
    const issueComment = context.issue({
           body: "Thanks for submitting onboarding request!",
         });
    
    // try {
    //     const data = await parse(context);
    // } catch {
    //     app.log.info('Issue was not created using Issue form template (the YAML ones)');
    //     console.log("We in here but failed");
    // }
    
    const data = { //test data until parse working
      targetCluster: ["cluster"],
      teamName: "name",
      desiredProjectName: "namespace",
      projectDescription: "description of project",
      usersNeedingAccess: "users",
      namespaceQuota: ["custom"],
      customQuota: "custTest",
      GPGKey: ""
    };

    var cluster:string;
    if (data["targetCluster"][0] == "smaug" || data["targetCluster"][0] == "infra"){
      cluster = "moc/" + data["targetCluster"];
    } else{
      cluster = "emea/" + data["targetCluster"];
    };

    var quota:string;
    if (data["namespaceQuota"][0] == "custom"){
      quota = data["customQuota"];
    } else{
      quota = data["namespaceQuota"][0];
    }

    const payloadDict = {
      namespace: data["desiredProjectName"],
      group: data["teamName"],
      quota: quota,
      cluster: cluster,
      description: data["projectDescription"],
      users: data["usersNeedingAccess"],
      GPG: data["GPGKey"]
    };

    const payload = JSON.stringify(payloadDict);

    createTaskRun('robozome', context)

  });
};
