import { GitHubClient } from "./github-client";
import { validateGithubConfig } from "./environment";

const GitHubClientInterface = {
    name: 'github',
    config: {},
    start: async (runtime: any) => {
        await validateGithubConfig(runtime);
        console.log("GitHubClientInterface start");

        const client = new GitHubClient(runtime);
        await client.initialize();
        await client.createMemoriesFromFiles();

        return client as any;
    },
    stop: async (_runtime: any) => {
        console.log("GitHubClientInterface stop");
    },
};
export default GitHubClientInterface;
