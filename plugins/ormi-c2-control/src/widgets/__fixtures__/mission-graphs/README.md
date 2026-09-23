# Mission graph golden fixtures — a COPY

These files are copied from the fog, which is authoritative for what a
behaviour graph means:

    multi-agent-framework/submodules/fog/centralized-coordination/
      src/centralized_coordination/test/fixtures/mission_graphs/

The fog's `test_mission_program` gtest and `../mission-program.test.ts` both run
every file here, so the editor and the fog refuse exactly the same graphs with
exactly the same codes.

**Copy, don't edit.** Change a fixture in the fog first, copy the directory
over, then make `mission-program.ts` pass.
