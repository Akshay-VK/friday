// Windows-only, bounded metadata read. Caller must validate a persisted live grant.
#define wmain preview_wmain
#include "source-preview.c"
#undef wmain
#define MAX_ENTRIES 32
#define MAX_DEPTH 3
#define MAX_BYTES 256
#define MAX_OUTPUT 8192
static ULONGLONG deadline;
static int entries, read_bytes, clipped, output_bytes;
static FILE_ID_INFO root_id;
static int pause_flip;
static const wchar_t *exclusions[32];
static int exclusion_count;

// Each record is built completely before writing; leave room for END even if capped.
static int emit(const char *kind, const wchar_t *name, size_t length, const BYTE *data, DWORD bytes, int depth) {
  char line[4096]; size_t n = 0;
  int prefix = snprintf(line, sizeof line, "%s %d \"", kind, depth);
  if (prefix < 0 || (size_t)prefix >= sizeof line) return 0;
  n = (size_t)prefix;
  for (size_t i = 0; i < length; ++i) {
    if (n + 6 >= sizeof line) return 0;
    n += (size_t)snprintf(line+n, sizeof line-n, "\\u%04x", (unsigned)name[i]);
  }
  if (n + 2 + bytes*2 >= sizeof line) return 0;
  line[n++] = '"';
  if (data) {
    line[n++] = ' ';
    for (DWORD i = 0; i < bytes; i++) n += (size_t)snprintf(line+n, sizeof line-n, "%02x", data[i]);
  }
  line[n++] = '\n';
  // Windows CRT translates LF to CRLF on stdout; count the extra byte.
  if (output_bytes + (int)n + 1 + 80 > MAX_OUTPUT) { clipped = 1; return 0; }
  if (fwrite(line, 1, n, stdout) != n) return 0;
  output_bytes += (int)n + 1;
  return 1;
}

static int child_name(const wchar_t *s, size_t n) {
  if (!n || n > 128 || (n == 1 && s[0] == L'.') || (n == 2 && s[0] == L'.' && s[1] == L'.') || s[n-1] == L'.' || s[n-1] == L' ') return 0;
  for (size_t i = 0; i < n; i++) if (s[i] < 32 || s[i] == L'/' || s[i] == L'\\' || s[i] == L':' || s[i] == L'~') return 0;
  return 1;
}
static HANDLE relative_open(HANDLE parent, const wchar_t *name, size_t len, int dir) {
   // The parent and every ancestor have no-delete handles; the final component
   // is opened with Win32 OPEN_NO_RECALL and OPEN_REPARSE_POINT. Compare FileId
   // with the parent-handle enumeration before reading a byte or descending.
   wchar_t path[4096];
   DWORD size = GetFinalPathNameByHandleW(parent, path, 4000, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
   if (!size || size >= 4000 || size + len + 2 >= 4096 || wcsncmp(path, L"\\\\?\\", 4) || !iswalpha(path[4]) || path[5] != L':' || path[6] != L'\\') return INVALID_HANDLE_VALUE;
   path[size++] = L'\\';
   memcpy(path + size, name, len * sizeof(wchar_t));
   path[size + len] = 0;
   HANDLE h = CreateFileW(path, FILE_READ_ATTRIBUTES | (dir ? FILE_LIST_DIRECTORY : FILE_READ_DATA),
       FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING,
       FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_OPEN_NO_RECALL | (dir ? FILE_FLAG_BACKUP_SEMANTICS : 0), NULL);
   return h;
}
static int walk(HANDLE parent, int depth, int git_dir, CLASSIFY classify) {
  BYTE buffer[16384];
  for (;;) {
    if (GetTickCount64() >= deadline) return fail(L"deadline");
    if (!GetFileInformationByHandleEx(parent, FileIdExtdDirectoryInfo, buffer, sizeof buffer)) {
      if (GetLastError() == ERROR_NO_MORE_FILES) return 0;
      return fail(L"enumeration");
    }
    DWORD offset = 0;
    for (;;) {
      if (offset > sizeof buffer - offsetof(FILE_ID_EXTD_DIR_INFO, FileName)) return fail(L"entry offset");
      FILE_ID_EXTD_DIR_INFO *e = (FILE_ID_EXTD_DIR_INFO *)(buffer + offset);
      if ((e->FileNameLength & 1) || e->FileNameLength > sizeof buffer - offset - offsetof(FILE_ID_EXTD_DIR_INFO, FileName)) return fail(L"entry length");
      size_t n = e->FileNameLength / sizeof(wchar_t);
      if (n && !(n == 1 && e->FileName[0] == L'.') && !(n == 2 && e->FileName[0] == L'.' && e->FileName[1] == L'.')) {
        int excluded = 0;
        if (!depth) for (int i = 0; i < exclusion_count; i++)
          if (wcslen(exclusions[i]) == n && !_wcsnicmp(exclusions[i], e->FileName, n)) excluded = 1;
        if (excluded) goto next_entry;
        if (++entries > MAX_ENTRIES) { clipped = 1; return 0; }
        int dir = !!(e->FileAttributes & FILE_ATTRIBUTE_DIRECTORY);
        DWORD tag = e->FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT ? e->ReparsePointTag : 0;
        if (!child_name(e->FileName, n) || !safe_attr(e->FileAttributes, tag, classify)) {
          if (!emit("SKIP", e->FileName, n, NULL, 0, depth)) { clipped = 1; return 0; }
        } else if (dir && depth >= MAX_DEPTH) {
          clipped = 1;
        } else if (dir || (git_dir && n == 6 && wcsncmp(e->FileName, L"config", 6) == 0)) {
          if (pause_flip && n == 4 && wcsncmp(e->FileName, L"flip", 4) == 0) {
            fprintf(stderr, "READY_CHILD_LISTED\n"); fflush(stderr);
            Sleep(1200);
          }
          HANDLE child = relative_open(parent, e->FileName, n, dir);
          if (child != INVALID_HANDLE_VALUE) {
            FILE_ATTRIBUTE_TAG_INFO a;
            FILE_ID_INFO id;
            if (!GetFileInformationByHandleEx(child, FileAttributeTagInfo, &a, sizeof a) ||
                !GetFileInformationByHandleEx(child, FileIdInfo, &id, sizeof id) ||
                !!(a.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) != dir ||
                !safe_attr(a.FileAttributes, a.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT ? a.ReparseTag : 0, classify) ||
                 id.VolumeSerialNumber != root_id.VolumeSerialNumber || memcmp(&id.FileId, &e->FileId, sizeof id.FileId) != 0) {
               clipped = 1;
               if (!emit("SKIP", e->FileName, n, NULL, 0, depth)) { CloseHandle(child); clipped = 1; return 0; }
            } else if (dir) {
              if (!emit("DIR", e->FileName, n, NULL, 0, depth)) { CloseHandle(child); clipped = 1; return 0; }
              if (walk(child, depth + 1, n == 4 && wcsncmp(e->FileName, L".git", 4) == 0, classify)) { CloseHandle(child); return 2; }
            } else {
              FILE_STANDARD_INFO size;
              if (GetFileInformationByHandleEx(child, FileStandardInfo, &size, sizeof size) && size.EndOfFile.QuadPart >= 0 && size.EndOfFile.QuadPart <= MAX_BYTES - read_bytes) {
                BYTE data[MAX_BYTES]; DWORD got = 0;
                if (ReadFile(child, data, (DWORD)size.EndOfFile.QuadPart, &got, NULL) && got == (DWORD)size.EndOfFile.QuadPart) {
                  read_bytes += got;
                  if (!emit("MANIFEST", e->FileName, n, data, got, depth)) { CloseHandle(child); clipped = 1; return 0; }
                } else { clipped = 1; if (!emit("SKIP", e->FileName, n, NULL, 0, depth)) { CloseHandle(child); return 0; } }
              } else { clipped = 1; if (!emit("SKIP", e->FileName, n, NULL, 0, depth)) { CloseHandle(child); return 0; } }
            }
            CloseHandle(child);
          } else { clipped = 1; if (!emit("SKIP", e->FileName, n, NULL, 0, depth)) return 0; }
        } else if (!emit("FILE", e->FileName, n, NULL, 0, depth)) { clipped = 1; return 0; }
      }
      next_entry:
      if (!e->NextEntryOffset) break;
      if (e->NextEntryOffset < offsetof(FILE_ID_EXTD_DIR_INFO, FileName) || e->NextEntryOffset > sizeof buffer - offset) return fail(L"entry offset");
      offset += e->NextEntryOffset;
    }
  }
}
int wmain(int argc, wchar_t **argv) {
  // Same root/home validation as the existing helper, plus expected grant identity.
  if (argc < 4 || !input(argv[1]) || !input(argv[2]) || wcslen(argv[3]) != 49) return fail(L"args");
  int arg = 4;
  if (arg < argc && (!wcscmp(argv[arg], L"--pause-flip") || !wcscmp(argv[arg], L"--stall"))) { pause_flip = 1; arg++; }
  while (arg < argc) {
    if (argc - arg < 2 || wcscmp(argv[arg], L"--exclude") || exclusion_count == 32 ||
        !child_name(argv[arg+1], wcslen(argv[arg+1]))) return fail(L"exclusion args");
    for (int i = 0; i < exclusion_count; i++) if (!_wcsicmp(exclusions[i], argv[arg+1])) return fail(L"duplicate exclusion");
    exclusions[exclusion_count++] = argv[arg+1]; arg += 2;
  }
  HMODULE cloud = LoadLibraryExW(L"CldApi.dll", NULL, LOAD_LIBRARY_SEARCH_SYSTEM32);
  CLASSIFY classify = cloud ? (CLASSIFY)GetProcAddress(cloud, "CfGetPlaceholderStateFromAttributeTag") : NULL;
  if (!classify) { if (cloud) FreeLibrary(cloud); return fail(L"cloud classifier unavailable"); }
  HANDLE root = open_dir(argv[1]), home = open_dir(argv[2]);
  int rc = 2;
  if (root == INVALID_HANDLE_VALUE || home == INVALID_HANDLE_VALUE) { fail(L"root/home open"); goto done; }
  FILE_ATTRIBUTE_TAG_INFO a, b;
  FILE_ID_INFO hid;
  wchar_t rp[2048], hp[2048], identity[50];
  if (!lock_ancestors(argv[1], classify) || !lock_ancestors(argv[2], classify) ||
      !GetFileInformationByHandleEx(root, FileAttributeTagInfo, &a, sizeof a) ||
      !GetFileInformationByHandleEx(home, FileAttributeTagInfo, &b, sizeof b) ||
      !GetFileInformationByHandleEx(root, FileIdInfo, &root_id, sizeof root_id) ||
      !GetFileInformationByHandleEx(home, FileIdInfo, &hid, sizeof hid) ||
      !canonical(root, rp) || !canonical(home, hp) ||
      !safe_attr(a.FileAttributes, a.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT ? a.ReparseTag : 0, classify) ||
      !safe_attr(b.FileAttributes, b.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT ? b.ReparseTag : 0, classify) ||
      !(a.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) || !(b.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) ||
      _wcsicmp(rp+4, argv[1]) || _wcsicmp(hp+4, argv[2]) || contains(rp,hp) || contains(hp,rp) ||
      (root_id.VolumeSerialNumber == hid.VolumeSerialNumber && !memcmp(&root_id.FileId, &hid.FileId, sizeof hid.FileId))) { fail(L"root/home validation"); goto done; }
  swprintf(identity, 50, L"%016llx-", (unsigned long long)root_id.VolumeSerialNumber);
  for (int i = 0; i < 16; i++) swprintf(identity+17+i*2, 50-17-i*2, L"%02x", (unsigned)root_id.FileId.Identifier[i]);
  if (_wcsicmp(identity, argv[3])) { fail(L"grant root identity mismatch"); goto done; }
  if (pause_flip && !wcscmp(argv[4], L"--stall")) { fprintf(stderr, "READY_STALL\n"); fflush(stderr); Sleep(10000); }
  deadline = GetTickCount64() + 2000;
  rc = walk(root, 0, 0, classify);
  if (!rc) printf("END entries=%d depth=%d bytes=%d clipped=%d\n", entries > MAX_ENTRIES ? MAX_ENTRIES : entries, MAX_DEPTH, read_bytes, clipped);
done:
  for (int i = 0; i < ancestor_count; i++) CloseHandle(ancestors[i]);
  if (root != INVALID_HANDLE_VALUE) CloseHandle(root);
  if (home != INVALID_HANDLE_VALUE) CloseHandle(home);
  if (cloud) FreeLibrary(cloud);
  return rc;
}
