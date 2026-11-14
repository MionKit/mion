// reuseBenchmarks ships the newest deploy artifact's numbers; from prod the workflow fails unless they were measured on its tree.
export function websiteDeployDispatchArgs(version, reuseBenchmarks = false) {
  const reuse = reuseBenchmarks ? ['-f', 'reuse_benchmarks=true'] : [];
  return ['workflow', 'run', 'website-deploy.yml', '--ref', 'prod', '-f', `version=${version}`, ...reuse];
}
