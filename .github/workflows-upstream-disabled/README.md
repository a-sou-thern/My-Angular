# Upstream Angular workflows (disabled)

These are the GitHub Actions workflows from [angular/angular](https://github.com/angular/angular).
They were moved here because they depend on the Angular team's infrastructure: Google remote
build execution, the `angular-robot` GitHub App, and secrets such as `WOMBOT_TOKEN` and
`ANGULAR_ROBOT_PRIVATE_KEY`. In this repository they would fail on every push, or try to publish
to the `@angular` npm scope.

GitHub only runs workflows in `.github/workflows/`, so nothing in this folder runs. They are kept
for reference, which makes upstream changes easier to compare. This repository's own pipeline is
`.github/workflows/build-and-publish.yml`.
