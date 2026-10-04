import test from "node:test";
import assert from "node:assert/strict";
import { resourcePolicy, safeOutput, skippedCompiler, stagesFor } from "./task3Validation.js";

test("constrained container skips compilation without claiming success", () => {
  const policy = resourcePolicy("536870912\n", "50000 100000\n");
  assert.deepEqual(policy, { memoryBytes: 536870912, cpuCores: 0.5, constrained: true });
  const result = skippedCompiler(policy);
  assert.equal(result.success, false);
  assert.equal(result.attempt, 0);
  assert.equal(result.status, "unverified_resource_limit");
  assert.equal(result.exitCode, null);
});
test("resource detection handles larger hosts, unlimited and absent metadata", () => {
  assert.equal(resourcePolicy("2147483648", "200000 100000").constrained, false);
  assert.deepEqual(resourcePolicy("max", "max 100000"), { memoryBytes: null, cpuCores: null, constrained: false });
  assert.deepEqual(resourcePolicy(null, null), { memoryBytes: null, cpuCores: null, constrained: false });
  assert.equal(resourcePolicy("536870912", "max 100000").constrained, true);
  assert.equal(resourcePolicy("max", "50000 100000").constrained, true);
});
test("normal all mode retains compiler and full suite; local mode is explicit", () => {
  assert.deepEqual(stagesFor("all"), ["targeted", "typecheck", "full"]);
  assert.deepEqual(stagesFor("local"), ["targeted", "full"]);
  assert.deepEqual(stagesFor("typecheck"), ["typecheck"]);
  assert.throws(() => stagesFor("arbitrary-command"));
});
test("silent successful command output remains valid and diagnostic secrets are redacted", () => {
  assert.equal(safeOutput(""), "");
  assert.equal(safeOutput(null), "");
  const output = safeOutput("https://example.test/?token=abc Bearer abc access_token=abc password=abc");
  assert.ok(!output.includes("abc"));
  assert.equal(safeOutput("x".repeat(25000)).length, 24000);
});
