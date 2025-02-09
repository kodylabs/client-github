// src/client.ts
import { Octokit } from "@octokit/rest";
import { glob } from "glob";
import simpleGit from "simple-git";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { createHash } from "crypto";
import {
  elizaLogger,
  knowledge,
  stringToUuid
} from "@elizaos/core";

// src/environment.ts
import { z } from "zod";
var githubEnvSchema = z.object({
  GITHUB_OWNER: z.string().min(1, "GitHub owner is required"),
  GITHUB_REPO: z.string().min(1, "GitHub repo is required"),
  GITHUB_BRANCH: z.string().min(1, "GitHub branch is required"),
  GITHUB_PATH: z.string().min(1, "GitHub path is required"),
  GITHUB_API_TOKEN: z.string().min(1, "GitHub API token is required")
});
async function validateGithubConfig(runtime) {
  try {
    const config = {
      GITHUB_OWNER: runtime.getSetting("GITHUB_OWNER"),
      GITHUB_REPO: runtime.getSetting("GITHUB_REPO"),
      GITHUB_BRANCH: runtime.getSetting("GITHUB_BRANCH"),
      GITHUB_PATH: runtime.getSetting("GITHUB_PATH"),
      GITHUB_API_TOKEN: runtime.getSetting("GITHUB_API_TOKEN")
    };
    return githubEnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(
        `GitHub configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/client.ts
var GitHubClient = class {
  octokit;
  git;
  config;
  runtime;
  repoPath;
  constructor(runtime) {
    this.runtime = runtime;
    this.config = {
      owner: runtime.getSetting("GITHUB_OWNER"),
      repo: runtime.getSetting("GITHUB_REPO"),
      branch: runtime.getSetting("GITHUB_BRANCH"),
      path: runtime.getSetting("GITHUB_PATH"),
      token: runtime.getSetting("GITHUB_API_TOKEN")
    };
    this.octokit = new Octokit({ auth: this.config.token });
    this.git = simpleGit();
    this.repoPath = path.join(
      process.cwd(),
      ".repos",
      this.config.owner,
      this.config.repo
    );
  }
  async initialize() {
    await fs.mkdir(path.join(process.cwd(), ".repos", this.config.owner), {
      recursive: true
    });
    if (!existsSync(this.repoPath)) {
      await this.cloneRepository();
    } else {
      const git = simpleGit(this.repoPath);
      await git.pull();
    }
    if (this.config.branch) {
      const git = simpleGit(this.repoPath);
      await git.checkout(this.config.branch);
    }
  }
  async cloneRepository() {
    const repositoryUrl = `https://github.com/${this.config.owner}/${this.config.repo}.git`;
    const maxRetries = 3;
    let retries = 0;
    while (retries < maxRetries) {
      try {
        await this.git.clone(repositoryUrl, this.repoPath);
        elizaLogger.log(
          `Successfully cloned repository from ${repositoryUrl}`
        );
        return;
      } catch {
        elizaLogger.error(
          `Failed to clone repository from ${repositoryUrl}. Retrying...`
        );
        retries++;
        if (retries === maxRetries) {
          throw new Error(
            `Unable to clone repository from ${repositoryUrl} after ${maxRetries} retries.`
          );
        }
      }
    }
  }
  async createMemoriesFromFiles() {
    console.log("Create memories");
    const searchPath = this.config.path ? path.join(this.repoPath, this.config.path, "**/*") : path.join(this.repoPath, "**/*");
    const files = await glob(searchPath, { nodir: true });
    for (const file of files) {
      const relativePath = path.relative(this.repoPath, file);
      const content = await fs.readFile(file, "utf-8");
      const contentHash = createHash("sha256").update(content).digest("hex");
      const knowledgeId = stringToUuid(
        `github-${this.config.owner}-${this.config.repo}-${relativePath}`
      );
      const existingDocument = await this.runtime.documentsManager.getMemoryById(knowledgeId);
      if (existingDocument && existingDocument.content["hash"] == contentHash) {
        continue;
      }
      console.log(
        "Processing knowledge for ",
        this.runtime.character.name,
        " - ",
        relativePath
      );
      await knowledge.set(this.runtime, {
        id: knowledgeId,
        content: {
          text: content,
          hash: contentHash,
          source: "github",
          attachments: [],
          metadata: {
            path: relativePath,
            repo: this.config.repo,
            owner: this.config.owner
          }
        }
      });
    }
  }
  async createPullRequest(title, branch, files, description) {
    const git = simpleGit(this.repoPath);
    await git.checkout(["-b", branch]);
    for (const file of files) {
      const filePath = path.join(this.repoPath, file.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content);
    }
    await git.add(".");
    await git.commit(title);
    await git.push("origin", branch);
    const pr = await this.octokit.pulls.create({
      owner: this.config.owner,
      repo: this.config.repo,
      title,
      body: description || title,
      head: branch,
      base: this.config.branch || "main"
    });
    return pr.data;
  }
  async createCommit(message, files) {
    const git = simpleGit(this.repoPath);
    for (const file of files) {
      const filePath = path.join(this.repoPath, file.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.content);
    }
    await git.add(".");
    await git.commit(message);
    await git.push();
  }
  async stop() {
    elizaLogger.warn("GitHub client does not support stopping yet");
  }
};
var GitHubClientInterface = {
  name: "github",
  start: async (runtime) => {
    await validateGithubConfig(runtime);
    elizaLogger.log("GitHubClientInterface start");
    const client = new GitHubClient(runtime);
    await client.initialize();
    await client.createMemoriesFromFiles();
    return client;
  }
};

// src/index.ts
var githubPlugin = {
  name: "github",
  description: "GitHub client",
  clients: [GitHubClientInterface]
};
var index_default = githubPlugin;
export {
  index_default as default
};
//# sourceMappingURL=index.js.map