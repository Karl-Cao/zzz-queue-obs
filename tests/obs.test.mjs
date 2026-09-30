import test from 'node:test';
import assert from 'node:assert/strict';
import {listObsInputs,screenshotObsSource,addLaplaceDashboard} from '../server/obs.mjs';

test('OBS screenshots use a named source while streaming and preserve dashboard setup guards',async()=>{
  const original=globalThis.WebSocket,requests=[];let streaming=true;
  class FakeSocket{
    constructor(){queueMicrotask(()=>this.onmessage({data:JSON.stringify({op:0,d:{authentication:{salt:'salt',challenge:'challenge'}}})}));}
    send(raw){const message=JSON.parse(raw);if(message.op===1){assert.ok(message.d.authentication);queueMicrotask(()=>this.onmessage({data:'{"op":2}'}));return;}
      const {requestType,requestId}=message.d;requests.push(message.d);
      const values={GetInputList:{inputs:[{inputName:'ZZZ',inputKind:'game_capture'}]},GetSourceScreenshot:{imageData:'data:image/png;base64,test'},GetVersion:{obsWebSocketVersion:'5.0'},GetCurrentProgramScene:{currentProgramSceneName:'Main'},GetStreamStatus:{outputActive:streaming},GetRecordStatus:{outputActive:false}};
      queueMicrotask(()=>this.onmessage({data:JSON.stringify({op:7,d:{requestId,requestStatus:{result:true},responseData:values[requestType]||{}}})}));
    }
    close(){this.onclose?.();}
  }
  globalThis.WebSocket=FakeSocket;
  try{
    assert.equal((await listObsInputs({port:4455,password:'test'}))[0].inputName,'ZZZ');
    assert.equal(await screenshotObsSource({port:4455,password:'test'},'ZZZ'),'data:image/png;base64,test');
    assert.equal(requests.find(x=>x.requestType==='GetSourceScreenshot').requestData.sourceName,'ZZZ');
    assert.equal(requests.some(x=>x.requestType==='CreateInput'),false);
    await assert.rejects(addLaplaceDashboard({port:4455,password:'test',url:'https://chat.laplace.live/dashboard/446277'}),/停止/);
    streaming=false;await addLaplaceDashboard({port:4455,password:'test',url:'https://chat.laplace.live/dashboard/446277'});
    assert.equal(requests.find(x=>x.requestType==='CreateInput').requestData.sceneItemEnabled,true);
  }finally{globalThis.WebSocket=original;}
});
