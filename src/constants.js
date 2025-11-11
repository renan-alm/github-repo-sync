
/**
 * Constants Module
 * Centralized configuration and magic strings used throughout the action
 */

// ===== GIT CONFIGURATION =====

export const GIT_CONFIG = {
  USER_NAME: "github-sync-action",
  USER_EMAIL: "github-sync@github.com",
};

// ===== BRANCH FALLBACK =====

export const BRANCH_FALLBACK_ORDER = ["main", "master"];

// ===== GERRIT DETECTION PATTERNS =====

export const GERRIT_DETECTION_PATTERNS = [
  /gerrit/i, // Contains "gerrit" in domain or path
  /:29418/, // Gerrit SSH default port
  /\/r\//, // Gerrit review path pattern
];

export const GERRIT_REFS = {
  REVIEW_QUEUE_PREFIX: "refs/for/",
  CHANGES_PREFIX: "refs/changes/",
};

// ===== SSH CONFIGURATION =====

export const SSH_CONFIG = {
  DIR_PERMISSIONS: 0o700,
  KEY_PERMISSIONS: 0o600,
  CONFIG_PERMISSIONS: 0o600,
  KNOWN_HOSTS_PERMISSIONS: 0o600,
  DEFAULT_KEY_NAME: "id_rsa",
};

export const SSH_HOST_CONFIG = {
  GITHUB: {
    host: "github.com",
    user: "git",
  },
  GITLAB: {
    host: "gitlab.com",
    user: "git",
  },
  GITEA: {
    host: "gitea.*",
    user: "git",
  },
  GERRIT: {
    host: "gerrit.*",
    user: "git",
  },
};

// ===== ERROR MESSAGES =====

export const ERROR_MESSAGES = {
  DESTINATION_MODIFIED: (branch) =>
    `Destination branch "${branch}" has been modified since last sync.`,
  DESTINATION_MODIFIED_DETAILS:
    "The destination contains commits that don't exist in the source.",
  DESTINATION_MODIFIED_RESOLUTION:
    "To resolve this, manually merge or rebase the destination changes.",
  BRANCH_NOT_FOUND: (branch, available) =>
    `Branch "${branch}" not found in source repository. Available branches: ${available.join(", ") || "none"}`,
  BRANCH_NOT_FOUND_WITH_FALLBACK: (branch, available) =>
    `Branch "${branch}" not found, and no fallback (main/master) available. Available branches: ${available.join(", ") || "none"}`,
};

// ===== INFO MESSAGES =====

export const INFO_MESSAGES = {
  REPO_TYPE_GERRIT: "✓ Gerrit repository detected",
  REPO_TYPE_STANDARD: "✓ Standard Git repository detected (GitHub, GitLab, Gitea, etc.)",
  GERRIT_SYNC_CONFIG: "Push Reference: refs/for/* (Gerrit review queue)",
  GERRIT_SYNC_NOTE: "Note: Changes will be created in Gerrit review queue",
  SYNC_CLEAN_SOURCE_AHEAD: "✓ Destination is clean, source is ahead. Pushing",
  SYNC_NEW_BRANCH: "is a new branch",
};

// ===== DEBUG MESSAGES =====

export const DEBUG_MESSAGES = {
  MERGE_BASE_NOT_FOUND: "No common history found between branches",
  REF_DOES_NOT_EXIST: (ref, exitCode) =>
    `Reference ${ref} does not exist (exit code: ${exitCode})`,
};
