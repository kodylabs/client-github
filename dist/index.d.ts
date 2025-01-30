declare const GitHubClientInterface: {
    start: (runtime: any) => Promise<any>;
    stop: (_runtime: any) => Promise<void>;
};

export { GitHubClientInterface as default };
