import { createHash, randomUUID } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('base64');

export async function addLaplaceDashboard({ port, password, url }) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const pending = new Map();
  let sequence = Promise.resolve();
  let settled = false;
  let timer;

  const close = () => {
    clearTimeout(timer);
    try { socket.close(); } catch {}
  };

  const ready = new Promise((resolve, reject) => {
    const fail = error => { if (!settled) { settled = true; reject(error); } };
    timer = setTimeout(() => fail(Error('OBS WebSocket 连接超时，请检查端口和 OBS 是否运行')), 8000);
    socket.onerror = () => fail(Error('无法连接 OBS WebSocket，请检查 OBS 是否运行和端口'));
    socket.onclose = () => {
      for (const request of pending.values()) request.reject(Error('OBS WebSocket 已断开'));
      pending.clear();
    };
    socket.onmessage = ({ data }) => {
      let message;
      try { message = JSON.parse(data); } catch { return; }
      if (message.op === 0) {
        const auth = message.d.authentication;
        if (auth && !password) { fail(Error('OBS 已启用身份验证，请填写 OBS WebSocket 密码')); return; }
        const authentication = auth ? digest(digest(password + auth.salt) + auth.challenge) : undefined;
        socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 0, ...(authentication ? { authentication } : {}) } }));
      } else if (message.op === 2) {
        if (!settled) { settled = true; clearTimeout(timer); resolve(); }
      } else if (message.op === 7) {
        const request = pending.get(message.d.requestId);
        if (!request) return;
        pending.delete(message.d.requestId);
        if (message.d.requestStatus.result) request.resolve(message.d.responseData);
        else request.reject(Error(`OBS 请求失败：${message.d.requestStatus.comment || '请检查 OBS 版本和设置'}`));
      }
    };
  });

  const request = async (requestType, requestData = {}) => {
    await ready;
    const previous = sequence;
    let release;
    sequence = new Promise(resolve => { release = resolve; });
    await previous;
    try {
      const requestId = randomUUID();
      const response = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => { pending.delete(requestId); reject(Error('OBS 请求超时')); }, 8000);
        pending.set(requestId, {
          resolve: value => { clearTimeout(timeoutId); resolve(value); },
          reject: error => { clearTimeout(timeoutId); reject(error); },
        });
      });
      socket.send(JSON.stringify({ op: 6, d: { requestId, requestType, requestData } }));
      return await response;
    } finally { release(); }
  };

  try {
    await ready;
    const [version, scene, stream, recording] = await Promise.all([
      request('GetVersion'), request('GetCurrentProgramScene'), request('GetStreamStatus'), request('GetRecordStatus'),
    ]);
    if (version.obsWebSocketVersion && Number(version.obsWebSocketVersion.split('.')[0]) < 5) {
      throw Error('需要 OBS 28 或更新版本的 WebSocket v5');
    }
    if (stream.outputActive || recording.outputActive) throw Error('请先停止 OBS 直播和录制，再添加 Dashboard；设置完成并隐藏来源后即可恢复');
    const sceneName = scene.currentProgramSceneName;
    const inputs = await request('GetInputList');
    const nameSet = new Set((inputs.inputs || []).map(x => x.inputName));
    let inputName = 'LAPLACE Dashboard';
    for (let suffix = 2; nameSet.has(inputName); suffix++) inputName = `LAPLACE Dashboard (${suffix})`;

    await request('CreateInput', {
      sceneName,
      inputName,
      inputKind: 'browser_source',
      inputSettings: { url, width: 1280, height: 900, shutdown: false, restart_when_active: false, reroute_audio: true },
      sceneItemEnabled: true,
    });

    let audioMonitoring = true;
    try {
      await request('SetInputAudioMonitorType', { inputName, monitorType: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT' });
    } catch { audioMonitoring = false; }

    let interactionOpened = true;
    try { await request('OpenInputInteractDialog', { inputName }); }
    catch { interactionOpened = false; }

    return { sceneName, inputName, audioMonitoring, interactionOpened };
  } finally { close(); }
}
