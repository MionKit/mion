// The `gh` args that dispatch website-deploy.yml on prod. reuseBenchmarks ships the newest deploy artifact's numbers
// (the workflow fails unless that run built the same tree).
export function websiteDeployDispatchArgs(version, {reuseBenchmarks = false} = {}) {
  const reuse = reuseBenchmarks ? ['-f', 'reuse_benchmarks=true'] : [];
  return ['workflow', 'run', 'website-deploy.yml', '--ref', 'prod', '-f', `version=${version}`, ...reuse];
}
