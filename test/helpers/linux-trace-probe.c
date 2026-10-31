// Standalone native child, intentionally makes only failing fixture write attempts.
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
int main(int argc, char **argv) {
  if (argc != 2) return 2;
  char path[4096];
  if (snprintf(path, sizeof(path), "%s/.git/config", argv[1]) >= (int)sizeof(path)) return 2;
  int fd = open(path, O_CREAT | O_EXCL | O_WRONLY, 0600);
  if (fd >= 0) { close(fd); return 2; }
  if (snprintf(path, sizeof(path), "%s/.git/new", argv[1]) >= (int)sizeof(path)) return 2;
  return unlink(path) == 0 ? 2 : 0;
}
