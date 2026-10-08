import { reviewDependencies } from "./dependency-review.mjs";

const { application, tooling } = reviewDependencies({});
process.stdout.write(JSON.stringify({ application, tooling }, null, 2) + "\n");
if (!application.passed || !tooling.passed) process.exitCode = 1;
