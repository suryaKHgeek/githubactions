import * as github from '@actions/github'
import * as core from '@actions/core'

import {Context} from '@actions/github/lib/context'

import {getCommandArgs} from '../utills/command'
import {getOrgCollabCommentUsers, checkCommenterAuth, getRoleOfUser} from '../utills/auth'

/**
 * /assign will self assign with no argument
 * or assign the users in the argument list
 *
 * @param context - the github actions event context
 */
export const assign = async (
  context: Context = github.context
): Promise<void> => {
  const toReturn: boolean[] = []
  let commentApgs: string[] = []
  core.debug(`starting assign job`)

  const token = core.getInput('github-token', {required: true})
  const octokit = new github.GitHub(token)

  const issueNumber: number | undefined = context.payload.issue?.number
  const commenterId: string = context.payload['comment']['user']['login']
  const commentBody: string = context.payload['comment']['body']

  if (issueNumber === undefined) {
    throw new Error(
      `github context payload missing issue number: ${context.payload}`
    )
  }

  let commentArgs: string[] = getCommandArgs('/assign', commentBody, commenterId)

  try {
    commentArgs.map(async arg => {
      const roleContents: any = getRoleOfUser(octokit, context, arg)

      const issueps = await octokit.pulls.list({
        owner: "Keptn",
        repo: "keptn/lifecycle-toolkit",
        state: "open",
      })
      const userPullRequestCount = issueps.data.filter(pr => pr.user.login == arg).length

      const issues = await octokit.issues.listForRepo ({
        owner: "Keptn",
        repo: "keptn/lifecycle-toolkit",
        assignee: arg,
      })
      for (const key in roleContents) {
        if (roleContents[key]['max-assigned-issues'] == issues.data.length || roleContents[key]['max-opened-prs'] == userPullRequestCount) {
          toReturn.push(true)
        } else {
          toReturn.push(false)
        }
      }
    })
  } catch (error) {
    throw new Error(`could not assign: ${error}`)
    }
      
let i = 0
for (const comm of toReturn) {
  if (comm == false) {
    commentApgs.push(commentArgs[i])
  } 
  i++
}

  switch (commentApgs.length) {
    case 0:
      throw new Error(
        `no users found. Only users who are members of the org, are collaborators, or have previously commented on this issue may be assigned`
      )

    default:
      try {
            await octokit.issues.addAssignees({
              ...context.repo,
              issue_number: issueNumber,
              assignees: commentApgs
            })
      } catch (e) {
        throw new Error(`could not add assignees: ${e}`)
      }
      break
  }
}

/**
 * selfAssign will assign the issue / pr to the user who commented
 *
 * @param octokit - a hydrated github client
 * @param context - the github actions event context
 * @param issueNum - the issue or pr number this runtime is associated with
 * @param user - the user to self assign
 */
const selfAssign = async (
  octokit: github.GitHub,
  context: Context,
  issueNum: number,
  user: string
): Promise<void> => {
  const isAuthorized = await checkCommenterAuth(
    octokit,
    context,
    issueNum,
    user
  )

  if (isAuthorized) {
    await octokit.issues.addAssignees({
      ...context.repo,
      issue_number: issueNum,
      assignees: [user]
    })
  }
}