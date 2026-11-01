# Linux source write-attempt fixture

`node --test test/source-write-trace.test.ts` compiles the two adjacent C programs
into a disposable directory under `/tmp/opencode`. A traced Friday server receives
HTTP preview and approval requests against a **test-created** source; the tracer
follows fork/clone/exec and logs pathname operations at syscall entry, including
failed operations. A separate native C child deliberately attempts failed
create/delete calls to prove process-boundary coverage. The probe also checks
attempted write opens on `.hidden`, `.git/config`, `ignored/cache`, and `untracked`.
The actual server trace must contain source-entry reads and **zero** source-write
attempts. Writes to the separate Friday state home are allowed and not hidden by
the tracer: only events targeting the source fixture are evaluated.

Requires Linux x86_64, a working `cc`, and permission to `ptrace` a child and
its descendants. Compilation/ptrace failures fail the Linux test rather than
silently skip it. On other operating systems the test is skipped. This is a
bounded syscall-entry fixture check, **not** a universal write barrier: other
architectures, alternate syscall mechanisms, memory-mapped writes, path aliases,
external processes and Windows `source-preview.exe` are not covered. It cannot
verify genuine provider-managed cloud-placeholder nonhydration. Node's
`--permission` fixture test is supplemental and is not considered exhaustive
write-attempt tracing.
