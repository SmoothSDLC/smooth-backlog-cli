# Release compatibility contract

Updater-managed releases declare `backlogSchemaVersion: 1` and
`backlogRuntimeVersion: 1` in package.json. The Node requirement is a minimum
floor such as `>=24` or `>=24.0.0`. Staging enforces npm engine requirements and
the CLI verifies the floor, storage schema, bootstrap protocol, and executable
before activation. Unsupported schemas/protocols require explicit migration
instructions and a manual npm installation. Major versions retaining these
contracts are available through explicit backlog update, never automatic update.
Concurrent updaters re-read the active installed version under the package lock
and never replace it with an older release.
