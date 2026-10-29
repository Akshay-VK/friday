// Test-only x86_64 Linux ptrace recorder. Run a child and its threads/processes;
// record attempted source operations at syscall entry (including failed calls).
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ptrace.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/user.h>
#include <sys/wait.h>
#include <unistd.h>

#if !defined(__linux__) || !defined(__x86_64__)
#error This test tracer requires Linux x86_64
#endif

static volatile sig_atomic_t stopping;
static void stop(int signal_number) { (void)signal_number; stopping = 1; }
struct task { pid_t pid; int entering; };
static struct task tasks[1024];
static size_t count;
static char root[PATH_MAX];
static FILE *output;

static struct task *task_for(pid_t pid) {
  for (size_t i = 0; i < count; i++) if (tasks[i].pid == pid) return &tasks[i];
  if (count == sizeof(tasks) / sizeof(tasks[0])) { fputs("too many traced tasks\n", stderr); exit(2); }
  tasks[count] = (struct task){ pid, 1 };
  return &tasks[count++];
}

static void remove_task(pid_t pid) {
  for (size_t i = 0; i < count; i++) if (tasks[i].pid == pid) { tasks[i] = tasks[--count]; return; }
}

static int remote_string(pid_t pid, unsigned long address, char *buffer, size_t capacity) {
  if (!address) return -1;
  for (size_t offset = 0; offset < capacity; offset += sizeof(long)) {
    errno = 0;
    long word = ptrace(PTRACE_PEEKDATA, pid, address + offset, 0);
    if (errno) return -1;
    size_t n = capacity - offset < sizeof(word) ? capacity - offset : sizeof(word);
    memcpy(buffer + offset, &word, n);
    if (memchr(buffer + offset, 0, n)) return 0;
  }
  return -1; // fail closed on a path longer than the recorder can decode
}

static void record_path(pid_t pid, const char *kind, const char *op, long dirfd, unsigned long address) {
  char name[PATH_MAX], prefix[PATH_MAX], path[PATH_MAX * 2];
  if (remote_string(pid, address, name, sizeof(name))) { fprintf(stderr, "could not decode %s path for %d\n", op, pid); stopping = 1; return; }
  if (name[0] == '/') {
    snprintf(path, sizeof(path), "%s", name);
  } else {
    char proc[128];
    if (dirfd == AT_FDCWD) snprintf(proc, sizeof(proc), "/proc/%d/cwd", pid);
    else snprintf(proc, sizeof(proc), "/proc/%d/fd/%ld", pid, dirfd);
    ssize_t n = readlink(proc, prefix, sizeof(prefix) - 1);
    if (n < 0) { fprintf(stderr, "could not resolve %s directory for %d\n", op, pid); stopping = 1; return; }
    prefix[n] = 0;
    snprintf(path, sizeof(path), "%s/%s", prefix, name);
  }
  // Lexical normalization, including .., is necessary to avoid prefix bypass.
  char copy[sizeof(path)], normalized[sizeof(path)];
  snprintf(copy, sizeof(copy), "%s", path);
  size_t end = 0;
  normalized[end++] = '/';
  char *save = NULL;
  for (char *part = strtok_r(copy, "/", &save); part; part = strtok_r(NULL, "/", &save)) {
    if (!strcmp(part, ".")) continue;
    if (!strcmp(part, "..")) {
      if (end > 1) { end--; while (end > 1 && normalized[end - 1] != '/') end--; }
      continue;
    }
    size_t length = strlen(part);
    if (end + length + 1 >= sizeof(normalized)) { stopping = 1; return; }
    if (end > 1) normalized[end++] = '/';
    memcpy(normalized + end, part, length);
    end += length;
  }
  normalized[end] = 0;
  size_t prefix_length = strlen(root);
  if (strncmp(normalized, root, prefix_length) || (normalized[prefix_length] && normalized[prefix_length] != '/')) return;
  fprintf(output, "%s\t%d\t%s\t%s\n", kind, pid, op, normalized);
  fflush(output);
}

#define READ_PATH(op, fd, path) record_path(pid, "READ", op, fd, path)
#define WRITE_PATH(op, fd, path) record_path(pid, "WRITE", op, fd, path)
static void inspect(pid_t pid) {
  struct user_regs_struct r;
  if (ptrace(PTRACE_GETREGS, pid, 0, &r)) { stopping = 1; return; }
  // O_TMPFILE contains O_DIRECTORY; a plain directory read is not a write.
#define WRITING(flags) (((flags) & (O_WRONLY | O_RDWR | O_CREAT | O_TRUNC | O_APPEND)) || (((flags) & O_TMPFILE) == O_TMPFILE))
  switch (r.orig_rax) {
    case SYS_open:
      record_path(pid, WRITING(r.rsi) ? "WRITE" : "READ", "open", AT_FDCWD, r.rdi); break;
    case SYS_openat:
      record_path(pid, WRITING(r.rdx) ? "WRITE" : "READ", "openat", (long)r.rdi, r.rsi); break;
#ifdef SYS_openat2
    case SYS_openat2: // Unknown open_how flags: fail closed for source paths.
      WRITE_PATH("openat2 (flags unclassified)", (long)r.rdi, r.rsi); break;
#endif
    case SYS_newfstatat: READ_PATH("newfstatat", (long)r.rdi, r.rsi); break;
#ifdef SYS_statx
    case SYS_statx: READ_PATH("statx", (long)r.rdi, r.rsi); break;
#endif
    case SYS_stat: READ_PATH("stat", AT_FDCWD, r.rdi); break;
    case SYS_lstat: READ_PATH("lstat", AT_FDCWD, r.rdi); break;
    case SYS_readlink: READ_PATH("readlink", AT_FDCWD, r.rdi); break;
    case SYS_readlinkat: READ_PATH("readlinkat", (long)r.rdi, r.rsi); break;
    case SYS_access: READ_PATH("access", AT_FDCWD, r.rdi); break;
    case SYS_faccessat: READ_PATH("faccessat", (long)r.rdi, r.rsi); break;
    case SYS_creat: case SYS_truncate: case SYS_unlink: case SYS_rmdir: case SYS_mkdir: case SYS_chmod: case SYS_chown:
      WRITE_PATH("path mutation", AT_FDCWD, r.rdi); break;
    case SYS_unlinkat: case SYS_mkdirat: case SYS_fchmodat: case SYS_fchownat: case SYS_mknodat:
      WRITE_PATH("at mutation", (long)r.rdi, r.rsi); break;
    case SYS_rename: case SYS_link: case SYS_symlink:
      WRITE_PATH("rename/link source", AT_FDCWD, r.rdi);
      WRITE_PATH("rename/link destination", AT_FDCWD, r.rsi); break;
    case SYS_renameat: case SYS_renameat2: case SYS_linkat:
      WRITE_PATH("at source", (long)r.rdi, r.rsi);
      WRITE_PATH("at destination", (long)r.rdx, r.r10); break;
    case SYS_symlinkat:
      WRITE_PATH("symlink target", AT_FDCWD, r.rdi);
      WRITE_PATH("symlink destination", (long)r.rsi, r.rdx); break;
    case SYS_write: case SYS_writev: case SYS_pwrite64: case SYS_ftruncate: case SYS_fchmod: case SYS_fchown: case SYS_fallocate:
      // Resolve the already-open descriptor, not just open(path) attempts.
      {
        char proc[128], path[PATH_MAX];
        snprintf(proc, sizeof(proc), "/proc/%d/fd/%llu", pid, r.rdi);
        ssize_t n = readlink(proc, path, sizeof(path) - 1);
        if (n >= 0) { path[n] = 0; if (path[0] == '/') {
          // The traced task may have inherited an fd from its parent.
          char *deleted = strstr(path, " (deleted)");
          if (deleted) *deleted = 0;
          // A local buffer is not in tracee memory: classify directly here.
          size_t length = strlen(root);
          if (!strncmp(path, root, length) && (!path[length] || path[length] == '/')) {
            fprintf(output, "WRITE\t%d\tfd mutation\t%s\n", pid, path);
            fflush(output);
          }
        } }
      }
      break;
    default: break;
  }
}

int main(int argc, char **argv) {
  if (argc < 4 || argv[1][0] != '/' || strlen(argv[1]) >= sizeof(root)) return 2;
  snprintf(root, sizeof(root), "%s", argv[1]);
  while (strlen(root) > 1 && root[strlen(root) - 1] == '/') root[strlen(root) - 1] = 0;
  output = fopen(argv[2], "w");
  if (!output) { perror("trace log"); return 2; }
  signal(SIGTERM, stop);
  signal(SIGINT, stop);
  pid_t child = fork();
  if (child < 0) { perror("fork"); return 2; }
  if (!child) {
    if (ptrace(PTRACE_TRACEME, 0, 0, 0)) _exit(126);
    raise(SIGSTOP);
    execvp(argv[3], argv + 3);
    _exit(127);
  }
  int status;
  if (waitpid(child, &status, 0) < 0 || !WIFSTOPPED(status)) return 2;
  task_for(child);
  long opts = PTRACE_O_TRACESYSGOOD | PTRACE_O_TRACEFORK | PTRACE_O_TRACEVFORK | PTRACE_O_TRACECLONE | PTRACE_O_TRACEEXEC | PTRACE_O_EXITKILL;
  if (ptrace(PTRACE_SETOPTIONS, child, 0, opts) || ptrace(PTRACE_SYSCALL, child, 0, 0)) { perror("ptrace setup"); return 2; }
  int failed = 0;
  while (count && !stopping) {
    pid_t pid = waitpid(-1, &status, __WALL);
    if (pid < 0) { if (errno == EINTR) continue; perror("waitpid"); failed = 1; break; }
    if (WIFEXITED(status) || WIFSIGNALED(status)) {
      if (pid == child && (!WIFEXITED(status) || WEXITSTATUS(status))) failed = 1;
      remove_task(pid);
      continue;
    }
    struct task *task = task_for(pid);
    int sig = WSTOPSIG(status);
    if (sig == (SIGTRAP | 0x80)) {
      if (task->entering) inspect(pid);
      task->entering = !task->entering;
    } else if (sig == SIGTRAP && (status >> 16) == PTRACE_EVENT_EXEC) {
      task->entering = 1;
    }
    int forward = sig == SIGTRAP || sig == SIGSTOP || sig == (SIGTRAP | 0x80) ? 0 : sig;
    if (ptrace(PTRACE_SYSCALL, pid, 0, forward)) { perror("ptrace resume"); failed = 1; break; }
  }
  if (stopping) failed = 1;
  for (size_t i = 0; i < count; i++) kill(tasks[i].pid, SIGKILL);
  fclose(output);
  return failed ? 1 : 0;
}
