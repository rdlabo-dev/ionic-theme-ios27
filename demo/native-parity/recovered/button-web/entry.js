import { initialize } from '@ionic/core/components/index.js';
import { defineCustomElement as button } from '@ionic/core/components/ion-button.js';
import { defineCustomElement as buttons } from '@ionic/core/components/ion-buttons.js';
import '@ionic/core/css/core.css';
initialize({mode:'ios'}); button(); buttons();
const results=[];
for(const target of document.querySelectorAll('[data-measure]')) {
 let samples, start, released;
 const scale=()=>new DOMMatrix(getComputedStyle(target).transform).a;
 target.addEventListener('pointerdown',()=>{
  start=performance.now(); released=null; samples=[];
  const tick=()=>{samples.push({t:performance.now()-start,scale:scale(),active:target.matches(':active')});if(released===null||performance.now()-released<500)requestAnimationFrame(tick);};requestAnimationFrame(tick);
 });
 target.addEventListener('pointerup',()=>{
  released=performance.now();const duration=released-start; const atRelease=scale();
  setTimeout(()=>{results.push({target:target.id,duration,atRelease,samples});document.querySelector('#status').textContent=`Recorded ${results.length}`;window.webkit.messageHandlers.metrics.postMessage(JSON.stringify(results));},550);
 });
}
