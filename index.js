import * as core from "@actions/core";
import simpleGit from "simple-git";
import { createAppAuth } from "@octokit/auth-app";

async function getAppInstallationToken(appId, privateKey, installationId) {
  const auth = createAppAuth({
    appId,
    privateKey,
    installationId,
  });
  const { token } = await auth({ type: "installation" });
  return token;
}

function readInputs() {
  return {
    sourceRepo: core.getInput("source_repo", { required: true }),
    sourceBranch: core.getInput("source_branch", { required: true }),
    destinationRepo: core.getInput("destination_repo", { required: true }),
    destinationBranch: core.getInput("destination_branch", { required: true }),
    syncTags: core.getInput("sync_tags"),
    sourceToken: core.getInput("source_token"),
    syncAllBranches: core.getInput("sync_all_branches") === "true",
    githubAppId: core.getInput("github_app_id"),
    githubAppPrivateKey: core.getInput("github_app_private_key"),
    githubAppInstallationId: core.getInput("github_app_installation_id"),
    githubToken: core.getInput("github_token"),
  };
}

function logInputs(inputs) {
  core.info(`Source: ${inputs.sourceRepo} (branch: ${inputs.sourceBranch})`);
  core.info(`Destination: ${inputs.destinationRepo} (branch: ${inputs.destinationBranch})`);
  core.info(`Sync all branches: ${inputs.syncAllBranches}`);
  core.info(`Sync tags: ${inputs.syncTags || "false"}`);
}

async function authenticate(inputs) {
  if (inputs.githubToken) {
    core.info("Using GitHub Personal Access Token for authentication...");
    return inputs.githubToken;
  } else if (
    inputs.githubAppId &&
    inputs.githubAppPrivateKey &&
    inputs.githubAppInstallationId
  ) {
    core.info("Authenticating as GitHub App installation...");
    const token = await getAppInstallationToken(
      inputs.githubAppId,
      inputs.githubAppPrivateKey,
      inputs.githubAppInstallationId,
    );
    core.info("GitHub App token obtained successfully");
    return token;
  } else {
    throw new Error(
      "Either github_token (PAT) or github_app credentials (app_id, private_key, installation_id) must be provided",
    );
  }
}

async function setupGitConfig(git) {
  core.info("=== Setting up Git Configuration ===");
  core.info("Configuring git user...");
  try {
    await git.addConfig("user.name", "github-sync-action", false, ["--global"]);
    await git.addConfig("user.email", "github-sync@github.com", false, ["--global"]);
    core.info("✓ Git user configured");
  } catch (error) {
    core.warning(`Could not set git config: ${error.message}`);
  }
}

function prepareUrls(sourceRepo, destinationRepo, destinationToken, sourceToken) {
  core.info("=== Preparing URLs with Authentication ===");
  
  let srcUrl = sourceRepo;
  let dstUrl = destinationRepo;

  if (destinationToken && dstUrl.startsWith("https://")) {
    dstUrl = dstUrl.replace("https://", `https://x-access-token:${destinationToken}@`);
    core.info("✓ Destination URL prepared with authentication");
    core.debug(`Destination URL: ${dstUrl.replace(/x-access-token:.*@/, "x-access-token:***@")}`);
  }

  if (sourceToken && srcUrl.startsWith("https://")) {
    srcUrl = srcUrl.replace("https://", `https://x-access-token:${sourceToken}@`);
    core.info("✓ Source URL prepared with authentication");
    core.debug(`Source URL: ${srcUrl.replace(/x-access-token:.*@/, "x-access-token:***@")}`);
  } else if (!sourceToken && srcUrl.startsWith("https://")) {
    core.info("ℹ Source repo is public (no token provided)");
  }

  return { srcUrl, dstUrl };
}

async function cloneDestinationRepo(git, dstUrl) {
  core.info("=== Cloning Destination Repository ===");
  core.info(`Cloning: ${dstUrl.replace(/x-access-token:.*@/, "x-access-token:***@")}`);
  try {
    await git.clone(dstUrl, "repo");
    core.info("✓ Destination repository cloned successfully");
  } catch (error) {
    core.error(`✗ Clone failed: ${error.message}`);
    throw error;
  }

  const repo = simpleGit("repo");
  core.info("Git repository initialized");
  return repo;
}

async function setupSourceRemote(repo, srcUrl) {
  core.info("=== Setting up Source Remote ===");
  const remotes = await repo.getRemotes(true);
  const sourceRemoteExists = remotes.some((r) => r.name === "source");

  if (!sourceRemoteExists) {
    core.info("Adding source remote...");
    await repo.addRemote("source", srcUrl);
    core.info("✓ Source remote added");
  } else {
    core.info("Updating existing source remote...");
    await repo.removeRemote("source");
    await repo.addRemote("source", srcUrl);
    core.info("✓ Source remote updated");
  }

  core.info("Fetching from source...");
  await repo.fetch("source");
  core.info("✓ Fetch from source completed");
}


async function syncBranches(repo, sourceBranch, destinationBranch, syncAllBranches) {
  if (syncAllBranches) {
    core.info("=== Syncing All Branches ===");
    const branches = await repo.branch(["-r"]);
    const branchNames = branches.all
      .filter((b) => b.startsWith("source/") && !b.includes("->"))
      .map((b) => b.replace("source/", ""));

    core.info(`Found ${branchNames.length} branches to sync`);

    for (const branch of branchNames) {
      core.info(`Syncing branch: ${branch}`);
      await repo.push(
        "origin",
        `refs/remotes/source/${branch}:refs/heads/${branch}`,
        { "--force": null },
      );
      core.info(`✓ Branch synced: ${branch}`);
    }
  } else {
    core.info("=== Syncing Single Branch ===");
    core.info(`Fetching branch: ${sourceBranch}`);
    await repo.fetch("source", sourceBranch);
    core.info(`✓ Fetched: ${sourceBranch}`);

    core.info(`Pushing to: ${destinationBranch}`);
    await repo.push(
      "origin",
      `refs/remotes/source/${sourceBranch}:refs/heads/${destinationBranch}`,
      { "--force": null },
    );
    core.info(`✓ Pushed to: ${destinationBranch}`);
  }
}

async function syncTags(repo, syncTags) {
  if (syncTags === "true") {
    core.info("=== Syncing All Tags ===");
    core.info("Fetching tags...");
    await repo.fetch("source", "--tags");
    core.info("✓ Tags fetched");

    core.info("Pushing tags...");
    await repo.pushTags("origin", { "--force": null });
    core.info("✓ Tags pushed");
  } else if (syncTags) {
    core.info("=== Syncing Tags Matching Pattern ===");
    core.info(`Pattern: ${syncTags}`);

    core.info("Fetching tags...");
    await repo.fetch("source", "--tags");
    core.info("✓ Tags fetched");

    const allTags = await repo.tags();
    const matchingTags = allTags.all.filter((tag) => tag.match(syncTags));

    core.info(`Found ${matchingTags.length} matching tags`);

    for (const tag of matchingTags) {
      if (tag) {
        core.info(`Pushing tag: ${tag}`);
        await repo.push("origin", `refs/tags/${tag}:refs/tags/${tag}`, {
          "--force": null,
        });
        core.info(`✓ Tag pushed: ${tag}`);
      }
    }
  } else {
    core.info("Tag syncing disabled");
  }
}


async function run() {
  try {
    core.info("=== GitHub Sync Action Started ===");

    const inputs = readInputs();
    logInputs(inputs);

    const destinationToken = await authenticate(inputs);
    
    const git = simpleGit();
    await setupGitConfig(git);

    const { srcUrl, dstUrl } = prepareUrls(
      inputs.sourceRepo,
      inputs.destinationRepo,
      destinationToken,
      inputs.sourceToken,
    );

    const repo = await cloneDestinationRepo(git, dstUrl);

    await setupSourceRemote(repo, srcUrl);

    await syncBranches(
      repo,
      inputs.sourceBranch,
      inputs.destinationBranch,
      inputs.syncAllBranches,
    );

    await syncTags(repo, inputs.syncTags);

    core.info("=== GitHub Sync Completed Successfully ===");
    core.info("Sync complete!");
  } catch (error) {
    core.error("=== GitHub Sync Failed ===");
    core.setFailed(error.message);
  }
}

run();
