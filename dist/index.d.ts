declare const GitHubClientInterface: {
    name: string;
    config: {};
    start: (runtime: any) => Promise<any>;
    stop: (_runtime: any) => Promise<void>;
};

export { GitHubClientInterface as default };
