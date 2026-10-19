import test from 'node:test';
import assert from 'node:assert/strict';
import { matchTrack, playlistOrder, candidateCheck, durationCheck } from '../src/matching.mjs';
import { sourceQuality, chooseFormat, inspectAudio } from '../src/quality.mjs';
import { Spotify, Providers, playlistReference, mediaUrl } from '../src/providers.mjs';

const source = { key: 'spotify:1', title: 'A Track', artist: 'Artist', duration: 200 };
const local = { ...source, id: '1' };
test('source order comes first, extra songs retain relative order; second sync is stable', () => {
  const first = playlistOrder(['b', 'a', 'missing', 'b'], ['x', 'a', 'y', 'b', 'z']);
  assert.deepEqual(first, { ids: ['b', 'a', 'x', 'y', 'z'], extraCount: 3, changed: true });
  assert.equal(playlistOrder(['b', 'a'], first.ids).changed, false);
  assert.deepEqual(playlistOrder([], ['x', 'y']).ids, ['x', 'y']);
});
test('order calculation never drops repeated local entries', () => {
  assert.deepEqual(playlistOrder(['a'], ['x', 'a', 'a']).ids, ['a', 'x', 'a']);
});
test('duplicate collection files prefer the one already in the linked playlist', () => {
  const library = [local, { ...local, id: '2' }];
  assert.equal(matchTrack(source, library).status, 'review');
  assert.equal(matchTrack(source, library, null, new Set(['2'])).localId, '2');
  assert.equal(matchTrack(source, library, null, new Set(['1', '2'])).status, 'review');
});
test('duration, version, missing files and saved decisions take precedence', () => {
  assert.equal(matchTrack(source, [{ ...local, duration: 220 }]).status, 'review');
  for (const mix of ['VIP', 'Dub', 'Extended Mix', 'Remix', 'Radio Edit'])
    assert.notEqual(matchTrack(source, [{ ...local, title: `A Track (${mix})` }]).status, 'matched');
  assert.equal(matchTrack(source, [{ ...local, missing: true }]).status, 'missing_file');
  assert.equal(matchTrack(source, [local], { ignored: true }).status, 'ignored');
  assert.equal(matchTrack(source, [local], { localId: '1' }).status, 'matched');
  assert.equal(durationCheck(200, 205).ok, false);
  assert.equal(durationCheck(0, 0).ok, false);
});
test('artist prefixes, collaboration separators and download labels normalize', () => {
  assert.equal(matchTrack({ ...source, title: 'Artist - A Track [FREE DL]', artist: 'Artist，Friend' }, [local]).status, 'matched');
});

test('equivalent comma and slash artist credits reuse a local file, retaining version and duration checks', () => {
  const track = { ...source, artist: 'Fixture Artist, Collaborator', title: 'Evening Session - Extended Main Mix', duration: 418.5 };
  const file = { ...track, id:'existing', artist:'Fixture Artist/Collaborator', duration:418 };
  assert.equal(matchTrack(track, [file]).localId, 'existing');
  assert.notEqual(matchTrack(track, [{...file, title:'Evening Session - Radio Edit'}]).status, 'matched');
  assert.notEqual(matchTrack(track, [{...file, duration:300}]).status, 'matched');
  assert.notEqual(matchTrack({...source, artist:'AC/DC'}, [{...local, artist:'AC'}]).status, 'matched');
});
test('video candidates must match identity, version and length', () => {
  assert.equal(candidateCheck(source, { title: 'Artist - A Track', duration: 200 }).ok, true);
  for (const candidate of [{ title: 'Artist - A Track', duration: 240 }, { title: 'Artist - A Track (preview)', duration: 200 }, { title: 'Artist - A Track', duration: 200, is_live: true }, { title: 'Artist - A Track VIP', duration: 200 }])
    assert.equal(candidateCheck(source, candidate).ok, false);
});

test('SoundCloud uploads in the linked playlist match uploader artist tags using exact credited titles and duration',()=>{
 const upload={...source,provider:'soundcloud',artist:'Fixture Performer',duration:355.6};
 for(const title of ["FIXTURE PERFORMER - What's New... [LABELFREE002]",'CAT002 - Fixture Performer - Evening Jam [Free DL]','FIXTURE PERFORMER IS IN THE HOUSE [CLIPS]']){
  const file={...local,artist:'Fixture Label',title,duration:355};
  const result=matchTrack({...upload,title},[file],null,new Set(['1']));
  assert.equal(result.localId,'1');assert.equal(result.status,'matched');assert.match(result.reason,/uploader artist tag differs/);
 }
});

test('uploader artist differences stay for review outside the linked playlist and never apply to Spotify',()=>{
 const upload={...source,provider:'soundcloud',artist:'Fixture Performer',title:'Fixture Performer - Evening Jam'};
 const file={...local,artist:'Fixture Label',title:upload.title};
 assert.equal(matchTrack(upload,[file]).status,'review');
 assert.notEqual(matchTrack({...upload,provider:'spotify'},[file],null,new Set(['1'])).status,'matched');
 assert.notEqual(matchTrack({...upload,title:'Evening Jam'},[{...file,title:'Evening Jam'}],null,new Set(['1'])).status,'matched');
 assert.notEqual(matchTrack({...upload,artist:'Form'},[file],null,new Set(['1'])).status,'matched');
});

test('SoundCloud uploader matching preserves duration, mix, duplicate and file-availability checks',()=>{
 const upload={...source,provider:'soundcloud',artist:'Fixture Performer',title:'Fixture Performer - Evening Jam'};
 const file={...local,artist:'Fixture Label',title:upload.title};
 for(const other of [{...file,duration:250},{...file,mixName:'Radio Edit'},{...file,title:upload.title+' Remix'}])
  assert.notEqual(matchTrack(upload,[other],null,new Set(['1'])).status,'matched');
 const library=[file,{...file,id:'2'}];
 assert.equal(matchTrack(upload,library,null,new Set(['1','2'])).status,'review');
 assert.equal(matchTrack(upload,library,null,new Set(['2'])).localId,'2');
 assert.equal(matchTrack(upload,[{...file,missing:true}],null,new Set(['1'])).status,'missing_file');
 assert.equal(matchTrack(upload,[file],{ignored:true},new Set(['1'])).status,'ignored');
});
test('strict quality rejects lossy upscaling and unknown bitrate', () => {
  for (const format of [{ acodec: 'opus', abr: 320 }, { acodec: 'aac', abr: 320 }, { acodec: 'mp3', abr: 128 }, { acodec: 'mp3' }]) assert.equal(sourceQuality(format).ok, false);
  assert.equal(sourceQuality({ acodec: 'mp3', abr: 320 }).ok, true);
  assert.equal(sourceQuality({ codec_name: 'flac' }).ok, true);
  assert.equal(chooseFormat({ formats: [{ acodec: 'opus', abr: 160 }] }), null);
});
test('probe uses audio stream bitrate, not container size; validates stereo and sample rate', () => {
  const audio = { codec_type: 'audio', codec_name: 'mp3', bit_rate: '320000', sample_rate: '44100', channels: 2, duration: '200' };
  assert.equal(inspectAudio({ streams: [audio] }, 200, { output: true }).ok, true);
  for (const change of [{ bit_rate: '128000' }, { channels: 1 }, { sample_rate: '22050' }, { duration: '180' }])
    assert.equal(inspectAudio({ streams: [{ ...audio, ...change }], format: { bit_rate: '900000' } }, 200).ok, false);
});
test('provider links and manual media sources reject unsupported hosts', () => {
  assert.equal(playlistReference('https://open.spotify.com/playlist/abc?si=test').url, 'https://open.spotify.com/playlist/abc');
  assert.equal(playlistReference('https://soundcloud.com/artist/sets/list').provider, 'soundcloud');
  for (const url of ['http://soundcloud.com/a/sets/b', 'https://evil.test/a/sets/b', 'https://open.spotify.com/track/abc']) assert.throws(() => playlistReference(url));
  assert.throws(() => mediaUrl('https://soundcloud.com:9999/a/b'));
  assert.throws(() => mediaUrl('file:///music.mp3'));
});
test('Spotify reads complete pages and rejects changes during pagination', async () => {
  const spotify = new Spotify({}, 'http://127.0.0.1:1/callback');
  const item = id => ({ item: { id, type: 'track', name: id, artists: [{ name: 'artist' }], duration_ms: 200000 } });
  let changed = false;
  spotify.get = async path => path.endsWith('fields=id,name,snapshot_id') ? { name: 'List', snapshot_id: 'a' } : path.endsWith('fields=snapshot_id') ? { snapshot_id: changed ? 'b' : 'a' } : path === 'next' ? { items: [item('2')], next: null, total: 2 } : { items: [item('1')], next: 'next', total: 2 };
  assert.equal((await spotify.playlist({ id: 'test' })).tracks.length, 2);
  changed = true; await assert.rejects(spotify.playlist({ id: 'test' }), /changed while reading/);
});
test('SoundCloud rejects partial metadata without publishing a snapshot', async () => {
  const providers = new Providers(null, { metadata: async () => ({ entries: [{ id: '1', title: 'Incomplete' }] }) });
  await assert.rejects(providers.playlist({ provider: 'soundcloud', url: 'https://soundcloud.com/a/sets/b' }), /incomplete/);
});
