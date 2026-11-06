'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {Resvg}=require('@resvg/resvg-js');
const {validateSVG,checkDimensions}=require('./publishing-svg');
try{validateSVG(workerData.svg);const renderer=new Resvg(workerData.svg,{fitTo:{mode:'width',value:workerData.width},font:{loadSystemFonts:true,defaultFontFamily:'PingFang SC'},background:'#ffffff'});checkDimensions(renderer.width,renderer.height);const bytes=renderer.render().asPng();parentPort.postMessage({bytes,width:renderer.width,height:renderer.height});}catch(error){parentPort.postMessage({error:error.message});}
