import parse from '@operate-first/probot-issue-form';
import { createPipelineRun } from '../lib/util';
import { Context } from 'probot';
import { comments } from '../lib/comments';

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
      const msg: string = comments.FORM_TASK_FAILED_NO_LABELS(issue);
      context.log.error(msg);
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

    if (!scriptPath || !taskType || !targetRepo) {
      const msg: string = comments.FORM_TASK_FAILED_NO_LABELS(issue);
      await context.octokit.issues.createComment(context.issue({ body: msg }));

      context.log.error(msg);
    }

    // TODO: Add validation for label configs
    // Does repo exist in this org? the task-type? etc.

    const payload = JSON.stringify(JSON.stringify(data));

    const res = await createPipelineRun(
      'robozome-onboarding',
      taskType,
      context,
      [
        {
          name: 'PAYLOAD',
          value: payload,
        },
        {
          name: 'ISSUE_URL',
          value: issue,
        },
        {
          name: 'SCRIPT_PATH',
          value: scriptPath,
        },
        {
          name: 'REPO_NAME',
          value: targetRepo,
        },
      ]
    );

    if (res.response.statusCode != 201) {
      context.log.error(
        'OCP response when creating TaskRun did not return with HTTP 201.'
      );
    }

    const msg = comments.FORM_TASK_CREATION_SUCCESS;
    await context.octokit.issues.createComment(context.issue({ body: msg }));
  } catch (e) {
    const msg = comments.FORM_TASK_CREATION_FAIL;
    await context.octokit.issues.createComment(context.issue({ body: msg }));
    context.log.error(msg, e);
    throw e;
  }
};
