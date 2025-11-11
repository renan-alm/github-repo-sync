
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { BRANCH_FALLBACK_ORDER } from "./constants.js";

/**
 * Branch Utilities Module
 * Shared branch operations used by both standard and Gerrit flows
 * Eliminates duplication between index.js and gerrit.js
 */

/**
 * Get available branches from source remote
 * @param {string} sourcePrefix - Branch prefix to filter by (default: "source/")
 * @param {boolean} excludeGerritRefs - Exclude Gerrit special refs (default: false)
 * @returns {Promise<string[]>} List of branch names
 */
export async function getSourceBranches(sourcePrefix = "source/", excludeGerritRefs = false) {
  let stdout = "";
  try {
    await exec.exec("git", ["branch", "-r"], {
      listeners: {
        stdout: (data) => {
          stdout += data.toString();
        },
      },
    });
  } catch (error) {
    core.error(`Could not list branches: ${error.message}`);
    throw error;
  }

  const filterConditions = [
    (line) => line.startsWith(sourcePrefix),
    (line) => !line.includes("->"),
  ];

  // For Gerrit, exclude special refs
  if (excludeGerritRefs) {
    filterConditions.push(
      (line) => !line.includes("refs/for/"),
      (line) => !line.includes("refs/changes/"),
    );
  }

  const branchNames = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => filterConditions.every((condition) => condition(line)))
    .map((line) => line.replace(sourcePrefix, ""));

  return branchNames;
}

/**
 * Get destination branches
 * @returns {Promise<string[]>} List of destination branch names
 */
export async function getDestinationBranches() {
  let stdout = "";
  try {
    await exec.exec("git", ["branch", "-r"], {
      listeners: {
        stdout: (data) => {
          stdout += data.toString();
        },
      },
    });
  } catch (error) {
    core.error(`Could not list branches: ${error.message}`);
    throw error;
  }

  const branches = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.includes("HEAD") &&
        line.startsWith("origin/"),
    )
    .map((line) => line.replace("origin/", ""));

  return branches;
}

/**
 * Try to find a fallback branch from available branches
 * Uses BRANCH_FALLBACK_ORDER from constants (main, then master)
 * @param {string[]} availableBranches - List of available branches
 * @returns {Promise<string|null>} Fallback branch name or null if not found
 */
export async function getTryFallbackBranch(availableBranches) {
  for (const branch of BRANCH_FALLBACK_ORDER) {
    if (availableBranches.includes(branch)) {
      core.info(`Found fallback branch: ${branch}`);
      return branch;
    }
  }

  return null;
}
