// Markdown Studio — 샌드박스 프리로드
// 렌더러(웹 앱)에 최소 표면만 노출한다. 웹·안드로이드에는 이 브리지가 없고, 앱은 그때도
// 기존 경로(File System Access · 다운로드)로 정상 동작한다.
//
//  saveFile    탐색기에서 .md 를 더블클릭해 연 문서는 File System Access 핸들이 없어
//              '저장'이 '다른 이름으로 저장' 창으로 떨어진다. 그 경우 원본 경로에 직접 덮어쓴다.
//  openFile    '열기' 대화상자. FSA(showOpenFilePicker)로 연 파일은 webUtils.getPathForFile 가
//              빈 값을 줘 nativePath 가 비고 상대경로 이미지가 안 뜬다. 데스크톱은 이 네이티브
//              대화상자로 실제 경로를 확보해 연다.
//  readImage   문서가 참조하는 상대경로 이미지(![](사진.png))를 문서 파일이 있는 폴더에서 읽어
//              data URI 로 돌려준다. 데스크톱에서는 이것만으로 '폴더에서 열기' 없이 그림이 보인다.
//  pathForFile File 객체의 실제 경로. 위 기능들의 기준 경로를 얻는 수단이다.
//
// 실제 허용 여부(확장자·존재 여부·크기)는 모두 메인 프로세스에서 검사한다.

const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("mdsNative", {
  saveFile: (filePath, text) => ipcRenderer.invoke("mds:save-file", { path: filePath, text }),
  openFile: () => ipcRenderer.invoke("mds:open-file"),
  readImage: (base, rel) => ipcRenderer.invoke("mds:read-image", { base, rel }),
  pathForFile: (file) => {
    try { return webUtils.getPathForFile(file) || ""; }
    catch { return ""; }
  },
});
