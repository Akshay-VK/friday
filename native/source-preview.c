// One-level metadata-only Windows local-drive preview. Never open child names.
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <stdio.h>
#include <wchar.h>
#include <wctype.h>
#include <stddef.h>
#include <string.h>

#define LIMIT 48
#define UNSAFE (FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_OFFLINE | FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS)
typedef DWORD (WINAPI *CLASSIFY)(DWORD, DWORD);

static int fail(const wchar_t *why) { fwprintf(stderr, L"REJECT %ls (win32=%lu)\n", why, GetLastError()); return 2; }
static int input(const wchar_t *p) {
  size_t n = wcslen(p);
  if (n < 4 || n >= 1024 || !iswalpha(p[0]) || p[1] != L':' || p[2] != L'\\' || p[3] == L'\\' || p[n-1] == L'\\') return 0;
  for (size_t i = 3; i < n; ++i) {
    if (p[i] == L'/' || p[i] == L':' || p[i] == L'~' || p[i] < 32) return 0;
    if (p[i] == L'\\' && (p[i-1] == L'\\' || p[i-1] == L'.' || p[i-1] == L' ')) return 0;
  }
  if (p[n-1] == L'.' || p[n-1] == L' ') return 0;
  const wchar_t *part = p+3;
  do {
    const wchar_t *end = wcschr(part, L'\\');
    size_t len = end ? (size_t)(end-part) : wcslen(part);
    if ((len == 1 && part[0] == L'.') || (len == 2 && part[0] == L'.' && part[1] == L'.')) return 0;
    part = end ? end+1 : NULL;
  } while (part);
  return 1;
}
static int canonical(HANDLE h, wchar_t out[2048]) {
  DWORD n = GetFinalPathNameByHandleW(h, out, 2048, FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
  return n >= 7 && n < 2048 && wcsncmp(out, L"\\\\?\\", 4) == 0 && iswalpha(out[4]) && out[5] == L':' && out[6] == L'\\';
}
static int contains(const wchar_t *p, const wchar_t *q) {
  size_t len = wcslen(p);
  if (wcslen(q) < len) return 0;
  return _wcsnicmp(p,q,len) == 0 && (q[len] == 0 || q[len] == L'\\');
}
static HANDLE open_dir(const wchar_t *path) {
  return CreateFileW(path, FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_OPEN_NO_RECALL, NULL);
}
// Keep every ancestor open without FILE_SHARE_DELETE so a rename/swap cannot
// change the observed path while this process validates and enumerates it.
static HANDLE ancestors[256];
static int ancestor_count;
static int safe_attr(DWORD attributes, DWORD tag, CLASSIFY classify);
static int lock_ancestors(const wchar_t *path, CLASSIFY classify) {
  wchar_t part[1024], final[2048];
  size_t n = wcslen(path);
  for (size_t i = 3; i <= n; ++i) {
    if (path[i] != L'\\' && path[i] != 0) continue;
    if (ancestor_count == 256) return 0;
    wmemcpy(part, path, i);
    part[i] = 0;
    if (i == 3) continue;
    HANDLE h = open_dir(part);
    if (h == INVALID_HANDLE_VALUE) return 0;
    ancestors[ancestor_count++] = h;
    FILE_ATTRIBUTE_TAG_INFO a;
    if (!GetFileInformationByHandleEx(h, FileAttributeTagInfo, &a, sizeof a) ||
        !(a.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) ||
        !canonical(h, final) || _wcsicmp(final+4, part) != 0 ||
        !safe_attr(a.FileAttributes, (a.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) ? a.ReparseTag : 0, classify)) return 0;
  }
  return 1;
}
static int safe_attr(DWORD attributes, DWORD tag, CLASSIFY classify) {
  // Cloud classification is metadata-only; reject even fully local placeholders.
  DWORD state = classify ? classify(attributes, tag) : 0xffffffff;
  return !(attributes & UNSAFE) && tag == 0 && state == 0;
}
// ASCII-only JSON serialization of UTF-16 code units; no output depends on
// console codepages, quotes, embedded newlines or string splitting.
static void json_string(const wchar_t *s, size_t len) {
  putchar('"');
  for (size_t i = 0; i < len; i++) printf("\\u%04x", (unsigned)s[i]);
  putchar('"');
}
int wmain(int argc, wchar_t **argv) {
  HMODULE cloud = LoadLibraryExW(L"CldApi.dll", NULL, LOAD_LIBRARY_SEARCH_SYSTEM32);
  CLASSIFY classify = cloud ? (CLASSIFY)GetProcAddress(cloud, "CfGetPlaceholderStateFromAttributeTag") : NULL;
  if (argc != 4 || (wcscmp(argv[1], L"--preview") && wcscmp(argv[1], L"--identity")) ||
      !input(argv[2]) || !input(argv[3]) || !classify) return fail(L"unsupported path or cloud classifier unavailable");
  HANDLE root = open_dir(argv[2]);
  if (root == INVALID_HANDLE_VALUE) return fail(L"root open");
  HANDLE home = open_dir(argv[3]);
  if (home == INVALID_HANDLE_VALUE) { CloseHandle(root); return fail(L"home open"); }
  int result = 2;
  FILE_ATTRIBUTE_TAG_INFO ra, ha;
  FILE_ID_INFO ri, hi;
  wchar_t rp[2048], hp[2048];
  if (!lock_ancestors(argv[2], classify) || !lock_ancestors(argv[3], classify)) { result = fail(L"ancestor alias or unsafe attribute"); goto done; }
  if (!GetFileInformationByHandleEx(root, FileAttributeTagInfo, &ra, sizeof ra) ||
      !GetFileInformationByHandleEx(home, FileAttributeTagInfo, &ha, sizeof ha) ||
      !GetFileInformationByHandleEx(root, FileIdInfo, &ri, sizeof ri) ||
      !GetFileInformationByHandleEx(home, FileIdInfo, &hi, sizeof hi) ||
      !canonical(root,rp) || !canonical(home,hp)) { result = fail(L"identity/attribute query"); goto done; }
  if (!(ra.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) || !(ha.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) ||
      !safe_attr(ra.FileAttributes,(ra.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) ? ra.ReparseTag : 0,classify) ||
      !safe_attr(ha.FileAttributes,(ha.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) ? ha.ReparseTag : 0,classify)) {
    result = fail(L"root/home reparse or uncertain cloud attribute"); goto done;
  }
  if (_wcsicmp(rp+4,argv[2]) != 0 || _wcsicmp(hp+4,argv[3]) != 0) {
    result = fail(L"path alias, ancestor junction, or changed root/home"); goto done;
  }
  if ((ri.VolumeSerialNumber == hi.VolumeSerialNumber && memcmp(&ri.FileId,&hi.FileId,sizeof ri.FileId) == 0) || contains(rp,hp) || contains(hp,rp)) {
    result = fail(L"data home overlap"); goto done;
  }
  // No path-based open after this point: child links are never dereferenced.
  printf("{\"version\":1,\"nativePath\":");
  json_string(rp+4, wcslen(rp+4));
  printf(",\"identity\":\"%016llx-", (unsigned long long)ri.VolumeSerialNumber);
  for (int i = 0; i < 16; ++i) printf("%02x", (unsigned)ri.FileId.Identifier[i]);
  printf("\",\"sample\":[");
  if (!wcscmp(argv[1], L"--identity")) { printf("],\"skipped\":[],\"truncated\":false}\n"); result = 0; goto done; }
  BYTE buffer[16384];
  int seen = 0, stop = 0, samples = 0, skipped = 0, truncated = 0;
  wchar_t skipped_names[LIMIT][1024];
  size_t skipped_lengths[LIMIT];
  ULONGLONG started = GetTickCount64();
  while (!stop && seen <= LIMIT && GetTickCount64()-started < 2000) {
    if (!GetFileInformationByHandleEx(root, FileIdExtdDirectoryInfo, buffer, sizeof buffer)) {
      DWORD error = GetLastError();
      if (error == ERROR_NO_MORE_FILES) { stop = 1; break; }
      SetLastError(error); result = fail(L"directory enumeration unavailable"); goto done;
    }
    DWORD offset = 0;
    for (;;) {
      if (offset > sizeof buffer - offsetof(FILE_ID_EXTD_DIR_INFO,FileName)) { result = fail(L"invalid directory response"); goto done; }
      FILE_ID_EXTD_DIR_INFO *e = (FILE_ID_EXTD_DIR_INFO *)(buffer+offset);
      if (e->FileNameLength > sizeof buffer - offset - offsetof(FILE_ID_EXTD_DIR_INFO,FileName) || e->FileNameLength % 2) { result = fail(L"invalid entry length"); goto done; }
      if (e->FileNameLength && !(e->FileNameLength==2 && e->FileName[0]==L'.') && !(e->FileNameLength==4 && e->FileName[0]==L'.' && e->FileName[1]==L'.')) {
        if (++seen > LIMIT) { truncated = 1; stop = 1; break; }
        DWORD tag = (e->FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) ? e->ReparsePointTag : 0;
        size_t len = e->FileNameLength/2;
        if (len >= 1024) { result = fail(L"entry name too long"); goto done; }
        if (safe_attr(e->FileAttributes,tag,classify)) {
          if (samples++) putchar(',');
          json_string(e->FileName,len);
        } else {
          wmemcpy(skipped_names[skipped],e->FileName,len);
          skipped_lengths[skipped++] = len;
        }
      }
      if (!e->NextEntryOffset) break;
      if (e->NextEntryOffset < offsetof(FILE_ID_EXTD_DIR_INFO,FileName) || e->NextEntryOffset > sizeof buffer - offset) { result = fail(L"invalid entry offset"); goto done; }
      offset += e->NextEntryOffset;
    }
  }
  if (!stop) { result = fail(L"enumeration time limit"); goto done; }
  printf("],\"skipped\":[");
  for (int i = 0; i < skipped; i++) { if (i) putchar(','); json_string(skipped_names[i],skipped_lengths[i]); }
  printf("],\"truncated\":%s}\n", truncated ? "true" : "false");
  result = 0;
done:
  for (int i = 0; i < ancestor_count; i++) CloseHandle(ancestors[i]);
  CloseHandle(home); CloseHandle(root);
  if (cloud) FreeLibrary(cloud);
  return result;
}
