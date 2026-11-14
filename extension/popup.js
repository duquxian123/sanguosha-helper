const versionElement = document.querySelector("#version");
const copyButton = document.querySelector("#copyLog");
const statusElement = document.querySelector("#status");

versionElement.textContent = `v${chrome.runtime.getManifest().version}`;

function setStatus(message, kind = "") {
  statusElement.textContent = message;
  statusElement.classList.toggle("ok", kind === "ok");
  statusElement.classList.toggle("error", kind === "error");
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab || null;
}

async function contentDiagnostics(tabId) {
  if (!Number.isInteger(tabId)) return { ok: false, error: "没有活动标签页" };
  try {
    return (
      (await chrome.tabs.sendMessage(tabId, {
        type: "ROOMS_HELPER_GET_DIAGNOSTICS",
      })) || { ok: false, error: "页面脚本没有返回日志" }
    );
  } catch (error) {
    return { ok: false, error: error?.message || "无法连接页面脚本" };
  }
}

async function backgroundDiagnostics() {
  try {
    return (
      (await chrome.runtime.sendMessage({
        type: "ROOMS_HELPER_GET_BACKGROUND_DIAGNOSTICS",
      })) || { ok: false, error: "后台没有返回日志" }
    );
  } catch (error) {
    return { ok: false, error: error?.message || "无法连接扩展后台" };
  }
}

async function buildLog() {
  const tab = await currentTab();
  const [content, background] = await Promise.all([
    contentDiagnostics(tab?.id),
    backgroundDiagnostics(),
  ]);
  return [
    "三国杀房间监控助手诊断日志",
    `扩展版本: ${chrome.runtime.getManifest().version}`,
    `导出时间: ${new Date().toISOString()}`,
    `当前页面: ${tab?.url || "未知"}`,
    "",
    "== 页面脚本 ==",
    JSON.stringify(content, null, 2),
    "",
    "== 扩展后台 ==",
    JSON.stringify(background, null, 2),
  ].join("\n");
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

copyButton.addEventListener("click", async () => {
  copyButton.disabled = true;
  setStatus("正在收集日志…");
  try {
    const log = await buildLog();
    await copyText(log);
    setStatus(`已复制 ${log.length} 个字符的诊断日志。`, "ok");
  } catch (error) {
    setStatus(error?.message || "复制日志失败", "error");
  } finally {
    copyButton.disabled = false;
  }
});
