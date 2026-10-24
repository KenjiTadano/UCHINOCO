import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {imageLoadingExperiment,experimentalBodyLoading} from '../lib/diagnostics/offscreen-image-experiment.ts';

test('experiment is disabled for Production and invalid query values',()=>{
 for(const env of ['production','development',undefined])assert.equal(imageLoadingExperiment(env,'lazy'),false);
 for(const mode of [undefined,'baseline',['lazy'],'eager'])assert.equal(imageLoadingExperiment('preview',mode),false);
 assert.equal(imageLoadingExperiment('preview','lazy'),true);
});
test('first grid row and selected body remain unchanged',()=>{
 for(let i=0;i<13;i++){
  assert.equal(experimentalBodyLoading(false,i,false),undefined);
  assert.equal(experimentalBodyLoading(true,i,true),undefined);
 }
 for(const i of [0,1,2])assert.equal(experimentalBodyLoading(true,i,false),undefined);
 assert.equal(experimentalBodyLoading(true,3,false),'lazy');
});
test('React native lazy img omits generated preload without changing source or geometry',()=>{
 const props={src:'https://synthetic.invalid/image.jpg',width:100,height:80,style:{objectFit:'contain',objectPosition:'center',transform:'none'}};
 const baseline=renderToStaticMarkup(React.createElement('img',props));
 const lazy=renderToStaticMarkup(React.createElement('img',{...props,loading:'lazy'}));
 assert.match(baseline,/rel="preload"/);assert.doesNotMatch(lazy,/rel="preload"/);
 assert.match(lazy,/loading="lazy"/);assert.equal(baseline.match(/<img[^>]+>/)[0],lazy.match(/<img[^>]+>/)[0].replace(' loading="lazy"',''));
});
test('only Edit opts in; Preview and Page Editor do not set loading experiment',async()=>{
 const base='app/(app)/pets/[petId]/album/';
 for(const path of ['[albumId]/page.tsx','[albumId]/pages/edit/page.tsx'])assert.doesNotMatch(await readFile(base+path,'utf8'),/experimentalOffscreenLazy|imageLoadingExperiment/);
 const page=await readFile(base+'[albumId]/edit/page.tsx','utf8');assert.match(page,/imageLoadingExperiment\(process.env.VERCEL_ENV/);
 const renderer=await readFile(base+'_components/draft-spread-view.tsx','utf8');assert.match(renderer,/loading=\{imageLoading\}/);assert.doesNotMatch(renderer,/fetchPriority=/);
});
