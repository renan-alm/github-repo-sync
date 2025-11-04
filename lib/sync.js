import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";

/**
 * Executes a shell command and returns the output
 * @param {string} command - The command to execute
 * @param {boolean} quiet - Whether to suppress output
 * @returns {string} The command output
 */
function run(command, quiet = false) {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      stdio: quiet ? "pipe" : "inherit",
    });
    return output.trim();
  } catch (error) {
    throw new Error(`Command failed: ${command}\n${error.message}`);
  }
}

/**
 * Validates that GITHUB_TOKEN is set
 * @throws {Error} If GITHUB_TOKEN is not set
 */
export function validateGitHubToken() {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("Set the GITHUB_TOKEN environment variable.");
  }
}

/**
 * Sets up SSH key if SSH_PRIVATE_KEY is provided
 */
export function setupSSHKey() {
  if (process.env.SSH_PRIVATE_KEY) {
    console.log("Saving SSH_PRIVATE_KEY");

    const sshDir = `${homedir()}/.ssh`;
    mkdirSync(sshDir, { recursive: true });

    const keyPath = `${sshDir}/id_rsa`;
    writeFileSync(keyPath, process.env.SSH_PRIVATE_KEY);
    execSync(`chmod 600 ${keyPath}`);

    // Disable strict host key checking
    const sshConfigContent = "StrictHostKeyChecking no\n";
    const sshConfigPath = `${sshDir}/config`;
    writeFileSync(sshConfigPath, sshConfigContent, { flag: "a" });
  }
}

/**
 * Normalizes the upstream repository URL
 * @param {string} upstreamRepo - The upstream repository URL or GitHub slug
 * @returns {string} The normalized HTTPS Git URL
 */
export function normalizeRepositoryUrl(upstreamRepo) {
  // Check if it's already a valid git URI
  if (/:|@|\.git\/?$/.test(upstreamRepo)) {
    return upstreamRepo;
  }

  // Assume it's a GitHub repo slug (owner/repo)
  console.log(
    "UPSTREAM_REPO does not seem to be a valid git URI, assuming it's a GitHub repo",
  );
  console.log(`Originally: ${upstreamRepo}`);

  const normalizedUrl = `https://github.com/${upstreamRepo}.git`;
  console.log(`Now: ${normalizedUrl}`);

  return normalizedUrl;
}

/**
 * Parses branch mapping string (source:destination)
 * @param {string} branchMapping - The branch mapping string
 * @returns {object} Object with source and destination branches
 */
export function parseBranchMapping(branchMapping) {
  const [source, destination] = branchMapping.split(":");

  if (!source || !destination) {
    throw new Error(
      "Invalid branch mapping format. Expected: SOURCE_BRANCH:DESTINATION_BRANCH",
    );
  }

  return { source, destination };
}

/**
 * Configures git authentication and remote URLs
 * @param {string} upstreamRepo - The upstream repository URL
 */
export function configureGit(upstreamRepo) {
  const { GITHUB_ACTOR, GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env;

  if (!GITHUB_ACTOR || !GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    throw new Error(
      "Missing required GitHub environment variables: GITHUB_ACTOR, GITHUB_TOKEN, GITHUB_REPOSITORY",
    );
  }

  console.log(`UPSTREAM_REPO=${upstreamRepo}`);

  // Unset any existing http extra headers
  try {
    run('git config --unset-all http."https://github.com/".extraheader', true);
  } catch {
    // Ignore if not set
  }

  // Configure origin remote with authentication
  const originUrl = `https://${GITHUB_ACTOR}:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}`;
  console.log(
    `Resetting origin to: https://${GITHUB_ACTOR}:***@github.com/${GITHUB_REPOSITORY}`,
  );
  run(`git remote set-url origin "${originUrl}"`);

  // Add upstream remote
  console.log(`Adding tmp_upstream ${upstreamRepo}`);
  try {
    run("git remote rm tmp_upstream", true);
  } catch {
    // Remote might not exist yet
  }
  run(`git remote add tmp_upstream "${upstreamRepo}"`);
}

/**
 * Syncs a branch from upstream to origin
 * @param {string} sourceBranch - The source branch name
 * @param {string} destinationBranch - The destination branch name
 */
export function syncBranch(sourceBranch, destinationBranch) {
  console.log("Fetching tmp_upstream");
  run("git fetch tmp_upstream --quiet");
  run("git remote --verbose");

  console.log("Pushing changes from tmp_upstream to origin");
  run(
    `git push origin "refs/remotes/tmp_upstream/${sourceBranch}:refs/heads/${destinationBranch}" --force`,
  );
}

/**
 * Syncs tags based on SYNC_TAGS environment variable
 */
export function syncTags() {
  const { SYNC_TAGS } = process.env;

  if (!SYNC_TAGS) {
    return;
  }

  if (SYNC_TAGS === "true") {
    console.log("Force syncing all tags");
    // Delete all local tags
    const localTags = run("git tag -l", true);
    if (localTags) {
      run(`git tag -d ${localTags.split("\n").join(" ")}`, true);
    }
    run("git fetch tmp_upstream --tags --quiet");
    run("git push origin --tags --force");
  } else {
    console.log(`Force syncing tags matching pattern: ${SYNC_TAGS}`);
    // Delete all local tags
    const localTags = run("git tag -l", true);
    if (localTags) {
      run(`git tag -d ${localTags.split("\n").join(" ")}`, true);
    }
    run("git fetch tmp_upstream --tags --quiet");

    // Push matching tags
    const matchingTags = run(`git tag | grep "${SYNC_TAGS}"`, true);
    if (matchingTags) {
      const tags = matchingTags.split("\n").filter((t) => t);
      if (tags.length > 0) {
        run(`git push origin --force ${tags.map((t) => `"${t}"`).join(" ")}`);
      }
    }
  }
}

/**
 * Cleans up temporary remotes
 */
export function cleanupRemotes() {
  console.log("Removing tmp_upstream");
  try {
    run("git remote rm tmp_upstream");
  } catch {
    // Remote might already be removed
  }
  run("git remote --verbose");
}

/**
 * Main sync function that orchestrates the repository sync
 * @param {string} upstreamRepo - The upstream repository URL or GitHub slug
 * @param {string} branchMapping - The branch mapping (source:destination)
 */
export function sync(upstreamRepo, branchMapping) {
  if (!upstreamRepo) {
    throw new Error("Missing $UPSTREAM_REPO");
  }

  if (!branchMapping) {
    throw new Error("Missing $SOURCE_BRANCH:$DESTINATION_BRANCH");
  }

  const normalizedUrl = normalizeRepositoryUrl(upstreamRepo);
  const { source, destination } = parseBranchMapping(branchMapping);

  console.log(`BRANCHES=${branchMapping}`);

  configureGit(normalizedUrl);
  syncBranch(source, destination);
  syncTags();
  cleanupRemotes();

  console.log("Sync completed successfully!");
}
