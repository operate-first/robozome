import parse from '@operate-first/probot-issue-form';
import { createPipelineRun, IssueFormPipelineParams } from '../lib/util';
import { Context } from 'probot';
import { comments } from '../lib/comments';
import { HttpError } from '@kubernetes/client-node';
import { InstallationAccessTokenAuthentication } from '@octokit/auth-app';

export const handleIssueForm = async (
  context: Context<'issue_comment.created'> | Context<'issues.opened'>
) => {
  try {
    const data = await parse(context);
    const issue: string = context.payload.issue.html_url;
    const labels: string[] | undefined = context.payload.issue.labels?.map(
      (label) => {
        return label.name;
      }
    );

    if (!labels) {
      context.log.debug(
        'Issue has no labels, assume automation is not desired.'
      );
      return;
    }

    const scriptPath: string = labels
      .filter((l) => l.includes('script'))[0]
      ?.split(':')[1];
    const taskType: string = labels
      .filter((l) => l.includes('task-type'))[0]
      ?.split(':')[1];
    const targetRepo: string = labels
      .filter((l) => l.includes('repo'))[0]
      ?.split(':')[1];

    const receivedLabels = [scriptPath, taskType, targetRepo];
    const allExist = (arr: string[]) => arr.every((x) => x != undefined);
    const anyExist = (arr: string[]) => arr.some((x) => x != undefined);

    if (!anyExist(receivedLabels)) {
      context.log.debug(
        'Issue has none of the required labels, assume automation is not desired.'
      );
      return;
    }

    // Issue has at least one required label, assume automation desired, but
    // all required info is not present, provide feedback accordingly
    if (anyExist(receivedLabels) && !allExist(receivedLabels)) {
      const msg: string = comments.FORM_TASK_FAILED_NO_LABELS(issue);
      await context.octokit.issues.createComment(context.issue({ body: msg }));

      context.log.error(msg);
      return;
    }

    // TODO: Add validation for label configs
    // Does repo exist in this org? the task-type? etc.

    const payload = JSON.stringify(JSON.stringify(data));

    const appAuth = (await context.octokit.auth({
      type: 'installation',
    })) as InstallationAccessTokenAuthentication;
    const appname = await context.octokit.apps.getInstallation({
      installation_id: appAuth.installationId,
    });
    const user = await context.octokit.users.getByUsername({
      username: `${appname.data.app_slug}[bot]`,
    });

    const params: IssueFormPipelineParams = {
      SOURCE_REPO: context.payload.repository.name,
      TARGET_REPO: targetRepo,
      ISSUE_NUMBER: String(context.payload.issue.number),
      PAYLOAD: payload,
      TASK_TYPE: taskType,
      SCRIPT_PATH: scriptPath,
      WORKING_DIR: '/mnt/shared',
      WORKING_BRANCH_PREFIX: 'robozome',
      APP_USER_ID: String(user.data.id),
      APP_SLUG: appname.data.app_slug,
    };

    const res = await createPipelineRun('robozome-onboarding', params, context);

    if (res.response.statusCode != 201) {
      context.log.error(
        'OCP response when creating PipelineRun did not return with HTTP 201.'
      );
    }

    const msg = comments.FORM_TASK_CREATION_SUCCESS;
    await context.octokit.issues.createComment(context.issue({ body: msg }));
  } catch (e) {
    const msg = comments.FORM_TASK_CREATION_FAIL;
    await context.octokit.issues.createComment(context.issue({ body: msg }));

    if (e instanceof HttpError) {
      context.log.error(
        'Encountered error when trying to create PipelineRun.\n' +
          `Reason: ${e.body.reason}\nStatus Code: ${e.statusCode}\nMessage: ${e.body.message}`
      );
    } else {
      context.log.error(msg, e);
      throw e;
    }
  }
};
