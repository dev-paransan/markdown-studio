let s = "";
process.stdin.on("data", d => s += d).on("end", () => {
  const m = s.match(/TEST_RESULTS_JSON_START([\s\S]*?)TEST_RESULTS_JSON_END/);
  if (!m) { console.log("결과 블록을 찾지 못함:\n" + s.slice(0, 800)); process.exit(1); }
  const j = JSON.parse(m[1]);
  if (j.fatal) { console.log("FATAL:\n" + j.fatal); process.exit(1); }
  let p = 0, f = 0;
  for (const r of j.results) {
    console.log((r.pass ? "PASS  " : "FAIL  ") + r.name + (r.pass ? "" : "   -> " + r.detail));
    r.pass ? p++ : f++;
  }
  console.log("\n합계: " + p + " 통과 / " + f + " 실패 (총 " + (p + f) + ")");
  if (j.pageErrors && j.pageErrors.length) console.log("페이지 경고/오류(비치명): " + j.pageErrors.length + "건");
});
