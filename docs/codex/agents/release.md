# Release

After local acceptance and independent review pass, create the commit, push branch, open the PR, and verify checks against the exact PR HEAD. Before merge, re-fetch `main`, open PRs, conflict state, and semantic overlap.

Merge only under the current task's authorization and harness gates. Then identify the actual merge SHA and verify CI plus same-SHA Staging CD. Never treat successful PR CI as merge, deployment, runtime acceptance, or release approval.
