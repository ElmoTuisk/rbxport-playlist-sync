/** Shared by the standalone fallback and the in-rbxport popover. No network or host globals. */
export function mountPanel(root, initial, send) {
  if (root.playlistSyncPanel) { root.playlistSyncPanel.update(initial); return root.playlistSyncPanel; }
  let model = initial, expanded = null, mode = '', reviewing = null, error = '', busy = false, allFor = null;
  let bulkFor=null,bulkPlan=null,bulkAlternates=false,bulkNotice='';
  let qualityFor=null,qualityPlan=null;
  const reviewDrafts={},reviewNotices={};let qualityPending=null;
  let jobsByRow=new Map((initial.jobs || []).map(job=>[job.rowId,job]));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const libraryUnavailable = () => model.connected === false && !model.demo;
  const libraryActions = new Set(['sync','recheck','fallback','retry-missing','link','bulk-open','bulk-confirm','quality-bulk-open','quality-bulk-confirm','lower-review','lower-confirm']);
  const button = (action, text, id = '', extra = '') => `<button type="button" data-action="${action}" data-id="${esc(id)}" ${extra}${libraryUnavailable() && libraryActions.has(action) ? ' disabled' : ''}>${text}</button>`;
  const rows = () => model.rows?.[expanded] || [];
  const needsHelp = row => !['ready', 'matched', 'ignored'].includes(row.status);
  const inProgress = row => ['searching','downloading','validating','importing','analysing'].includes(jobsByRow.get(row.id)?.status);
  const labels = { missing: 'Not downloaded yet', review: 'Check source', missing_file: 'File unavailable', unavailable: 'Unavailable', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted' };
  const qualityOffer = row => {
    if (!needsHelp(row) || row.reviewKind === 'match') return null;
    const job = jobsByRow.get(row.id);
    if (!job?.lowerOptions?.length) return null;
    if(job.file && job.quality?.ok && !job.quality.belowStandard)return null;
    // Old web alternatives are not the file currently being acquired. Keep the
    // offers for later review, but do not imply the fallback is below standard.
    if (inProgress(row) && (!job.qualityApproval || (job.sourcePath && job.sourceReport?.ok && !job.sourceReport.belowStandard))) return null;
    const option = job.qualityApproval || [...job.lowerOptions].sort((a,b) => Number(b.verified)-Number(a.verified) || (Number(b.bitrate)||0)-(Number(a.bitrate)||0))[0];
    const quality = `${String(option.codec || 'audio').toUpperCase()} ${option.bitrate > 0 ? Math.round(option.bitrate)+' kbps' : '· bitrate unknown'} · ${option.verified ? 'verified' : 'reported'}`;
    const pending = !job.qualityApproval;
    const state = pending ? job.originalOnly ? 'Lower-quality original stream available' : 'Lower-quality alternatives available' : 'Lower-quality download approved';
    return { pending, label: `${state} · ${quality}` };
  };
  const rowLabel = row => {
    const job=jobsByRow.get(row.id),offer=qualityOffer(row);
    if(offer)return offer.label;
    const audio=report=>`${String(report.codec || 'audio').toUpperCase()}${report.bitrate>0?' '+Math.round(report.bitrate)+' kbps':''}`;
    if(inProgress(row)){
      if(job.sourcePath && job.sourceReport?.ok && !job.sourceReport.belowStandard)
        return `${audio(job.sourceReport)} verified · ${['importing','analysing'].includes(job.status)?'Finishing import':'Preparing file'}`;
      return job.status==='searching'?`Searching ${job.acquisition==='soulseek'?'Soulseek':'sources'} for audio at your standard`:job.status==='downloading'?`Downloading${job.acquisition==='soulseek'?' from Soulseek':''} · quality check pending`:job.status==='validating'?'Verifying downloaded audio':'Finishing verified import';
    }
    if(row.status==='ready' && job?.status==='ready' && job.quality?.ok && !job.quality.belowStandard)return `Ready · ${audio(job.quality)} · verified`;
    if(needsHelp(row) && job?.file && job.quality?.ok && !job.quality.belowStandard)return `${audio(job.quality)} verified · import needs retry`;
    return row.status === 'review' && row.reviewKind === 'match' ? 'Check existing match' : needsHelp(row)&&row.track.sourceAudio?.preview ? 'SoundCloud preview only · full recording needed' : needsHelp(row)&&row.track.sourceAudio?.unavailable ? 'Original unavailable · Sync to search alternatives' : labels[row.status] || row.status;
  };
  function render(force = false) {
    if (!force && root.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    root.innerHTML = `<div class="ps-head"><strong>Playlist sync</strong><div>${button('settings', '⚙', '', 'aria-label="Sync settings" title="Settings"')}${button('close', '×', '', 'aria-label="Close playlist sync"')}</div></div>
      ${error ? `<p class="ps-error" role="alert">${esc(error)}</p>` : ''}
      ${model.demo ? '<p class="ps-muted">Example data</p>' : ''}
      ${model.automaticPaused ? '<p class="ps-muted">Automatic sync paused for this session.</p>' : ''}
      ${model.connected || model.demo ? '' : `<p class="ps-muted" role="status">${esc(model.connectionError || 'rbxport is disconnected.')} ${button('connect', 'Reconnect')}</p>`}
      <div class="ps-list">${(model.links || []).map(link => {
        const progress = (model.jobs || []).find(j => j.linkId === link.id && ['searching','downloading','validating','importing','analysing'].includes(j.status));
        const status = model.active === link.id ? progress ? `${progress.title} · ${progress.status}${progress.progress ? ` ${progress.progress}` : ''}` : 'Checking playlist…' : link.message || 'Ready to check';
        return `<section class="ps-playlist"><div class="ps-line"><button class="ps-name" type="button" data-action="details" data-id="${esc(link.id)}" aria-expanded="${expanded === link.id}"><span class="ps-symbol ${link.status === 'synced' ? 'ps-good' : link.status === 'attention' || link.status === 'failed' ? 'ps-warn' : ''}" title="${esc(link.status === 'synced' ? 'Synced' : 'Linked playlist')}">⇄</span>${esc(link.name)}</button>${button('sync', 'Sync', link.id, model.active || busy ? 'disabled' : '')}</div><p class="ps-status">${esc(status)}</p>
          ${expanded === link.id ? `<div class="ps-details"><label class="ps-check"><input type="checkbox" data-automatic="${esc(link.id)}" ${link.automatic ? 'checked' : ''} ${libraryUnavailable() ? 'disabled' : ''}> Auto-sync</label>${link.extraCount ? `<p class="ps-muted">${link.extraCount} extra local songs kept at the bottom.</p>` : ''}
          <div class="ps-tools">${button('recheck','Recheck files',link.id,model.active || busy ? 'disabled' : '')}${rows().some(needsHelp) ? button('retry-missing','Retry missing',link.id,model.active || busy ? 'disabled' : '') : ''}${rows().some(r=>r.status==='review'&&r.reviewKind==='match') ? button('bulk-open','Accept suggested matches',link.id,model.active || busy ? 'disabled' : '') : ''}${rows().some(r=>qualityOffer(r)?.pending) ? button('quality-bulk-open','Accept lower quality…',link.id,model.active || busy ? 'disabled' : '') : ''}</div>
          ${bulkFor===link.id?bulkForm():''}${qualityFor===link.id?bulkQualityForm():''}${bulkNotice?`<p class="ps-muted" role="status">${esc(bulkNotice)}</p>`:''}
          ${rows().filter(needsHelp).map(row => `<div class="ps-track"><div><strong>${esc(row.track.title)}</strong><small${qualityOffer(row)?' class="ps-quality"':''}>${esc(rowLabel(row))}</small></div>${button('review', reviewing === row.id ? 'Close' : inProgress(row)?'Details':qualityOffer(row)?.pending ? 'Review quality' : 'Resolve', row.id, `aria-expanded="${reviewing === row.id}"`)}</div>${reviewing === row.id ? reviewForm(row) : ''}`).join('') || `<p class="ps-muted">${link.lastCheck ? 'No tracks need attention.' : 'Sync to check this playlist.'}</p>`}
          <details class="ps-more" data-all-tracks="${esc(link.id)}" ${allFor===link.id?'open':''}><summary>All tracks · ${rows().length}</summary>${allFor===link.id?rows().map(r => `<div class="ps-track"><div><strong>${esc(r.track.title)}</strong><small${qualityOffer(r)||r.audioQuality?.belowStandard?' class="ps-quality"':''}>${esc(r.track.artist)} · ${esc(rowLabel(r))}${r.audioQuality?.belowStandard?` · LOWER ${esc(r.audioQuality.codec.toUpperCase())} ${r.audioQuality.bitrate?Math.round(r.audioQuality.bitrate)+' kbps':'bitrate unknown'}${r.audioQuality.officialOriginal?' · official original':''}`:''}</small></div></div>`).join(''):''}</details></div>` : ''}</section>`;
      }).join('') || '<p class="ps-empty">Link a Spotify or SoundCloud playlist.</p>'}</div>
      ${mode === 'link' ? linkForm() : ['settings','soulseek'].includes(mode) ? settingsForm() : ''}
      <div class="ps-foot">${button('link', '+ Link playlist', '', 'class="ps-text"')}<span>${model.settings?.quality==='club-aac-256'?'MP3 320 · AAC 256':'320 kbps MP3'}</span>${model.active ? button('cancel', 'Cancel') : ''}</div>`;
  }
  function linkForm() {
    return `<form data-form="link" class="ps-form"><label>Playlist URL<input name="url" type="url" placeholder="Spotify or SoundCloud link" required></label><label>rbxport playlist<select name="playlistId"><option value="">Create new…</option>${(model.playlists || []).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><label>New name <span class="ps-muted">(if creating)</span><input name="newName"></label><div class="ps-form-actions">${button('dismiss', 'Cancel')}<button ${busy ? 'disabled' : ''}>Link</button></div></form>`;
  }
  function bulkForm() {
    const entries=bulkPlan?.entries || [];
    return `<div class="ps-form" data-bulk-preview><strong>${bulkPlan?`Accept ${entries.length} matches and apply source order?`:'Checking existing matches…'}</strong><label class="ps-check"><input type="checkbox" data-bulk-alternates ${bulkAlternates?'checked':''} ${busy?'disabled':''}> Include different lengths or versions</label><p class="ps-muted">Uses your existing files and orders linked songs like the source playlist, with extra songs at the bottom. No downloads. ${bulkAlternates?'Some local versions differ from the source recording.':'Different lengths and versions are excluded.'}</p>${bulkPlan?`<details class="ps-more"><summary>View ${entries.length} suggestions</summary>${entries.map(e=>`<div class="ps-track"><div><strong>${esc(e.title)}</strong><small>→ ${esc(e.localTitle)} · ${Math.round(e.localDuration)}s (source ${Math.round(e.duration)}s)${e.alternate?' · different length/version':''}</small><small>${esc(e.localArtist)}</small></div></div>`).join('')}</details><p class="ps-muted">${bulkPlan.skipped} reviews kept for individual choice. Uses the last checked source order.</p>`:''}<div class="ps-form-actions">${button('bulk-dismiss','Cancel')}${button('bulk-confirm',`Accept ${entries.length} & reorder`,bulkFor,!entries.length||busy||model.active?'disabled':'')}</div></div>`;
  }
  async function loadBulkPlan() {
    bulkPlan=null;render(true);
    const result=await act('match-plan',{id:bulkFor,includeAlternates:bulkAlternates});
    if(result && !error)bulkPlan=result;render(true);
    requestAnimationFrame(()=>root.querySelector('[data-bulk-preview]')?.scrollIntoView({block:'nearest'}));
  }
  function bulkQualityForm() {
    const entries=qualityPlan?.entries || [];
    return `<div class="ps-form" data-bulk-quality><strong>${qualityPlan?`Accept lower quality for ${entries.length} songs?`:'Checking available quality choices…'}</strong><p class="ps-muted">Uses the highest reported bitrate available for each song. Only these listed sources and formats are approved. Your normal audio standard stays unchanged. Downloads run one at a time, then source order is applied.</p>${qualityPlan?`<details class="ps-more"><summary>View ${entries.length} songs and quality</summary>${entries.map(e=>`<div class="ps-track"><div><strong>${esc(e.title)}</strong><small>${esc(e.codec.toUpperCase())} · ${Math.round(e.bitrate)} kbps · ${e.verified?'verified':'reported'}${['opus','vorbis'].includes(e.codec)?' · FLAC for playback':''}</small></div></div>`).join('')}</details>${qualityPlan.skipped?`<p class="ps-muted">${qualityPlan.skipped} choices need individual review because bitrate or length could not be confirmed.</p>`:''}`:''}<div class="ps-form-actions">${button('quality-bulk-dismiss','Cancel')}${button('quality-bulk-confirm',`Accept ${entries.length} & download`,qualityFor,!entries.length||busy||model.active?'disabled':'')}</div></div>`;
  }
  function reviewForm(row) {
    if (!row) return '';
    const match = row.reviewKind === 'match' && row.candidates?.length;
    const job=jobsByRow.get(row.id),draft=reviewDrafts[row.id] || {},action=draft.action || (job?.overrideUrl?'source':match?'match':'file');
    const attempts=job?.attempts || [];
    const sourceDetails=attempts.length ? '<details class="ps-more"><summary>Source attempts</summary>'+attempts.filter(a=>a.status!=='searching').slice(-12).map(a=>'<p class="ps-muted">'+esc(a.source)+': '+esc(a.message)+'</p>').join('')+'</details>' : '';
    const official=job?.officialDownload || row.track.sourceAudio?.officialDownload;
    return `<form data-form="resolve" data-id="${esc(row.id)}" class="ps-form"><strong>${esc(row.track.title)}</strong><p class="ps-muted">${esc(row.reason)}</p>${official?.enabled||official?.external?`<p class="ps-muted">${official.enabled?'Artist-enabled original download. If it is unavailable, SoundCloud sign-in may be required.':'The artist links to an external download page.'} ${button('official','View official download',row.id)}</p>`:''}${reviewNotices[row.id]?`<p role="status" class="ps-muted">${esc(reviewNotices[row.id])}</p>`:''}${qualityForm(row,job)}${sourceDetails}<label>Resolve<select name="action" id="ps-resolution">${[['file','Use an audio file'],['match','Match existing track'],['source','Use a source URL'],['retry','Retry'],['ignore','Ignore']].map(([value,label])=>`<option value="${value}" ${action===value?'selected':''}>${label}</option>`).join('')}</select></label><div id="ps-resolution-fields">${resolutionFields(action,row,draft,job)}</div><div class="ps-form-actions">${button('dismiss-review', 'Close')}<button ${busy||model.active?'disabled':''}>${action==='source'?'Check source & download':'Save'}</button></div></form>`;
  }
  function resolutionFields(action,row,draft={},job) {
    return action==='file'?`<label>Audio file path<input name="path" value="${esc(draft.path ?? (job?.acquisition==='manual'?job.sourcePath:'') ?? '')}" required></label>`:action==='source'?`<label>Source URL<input name="url" type="url" value="${esc(draft.url ?? job?.overrideUrl ?? '')}" required></label>`:action==='match'?matchFields(row):'';
  }
  function qualityForm(row,job) {
    if(!job?.lowerOptions?.length || job.status==='ready')return '';
    const options=[...job.lowerOptions].sort((a,b)=>Number(b.verified)-Number(a.verified)),chosen=qualityPending?.rowId===row.id?options.find(o=>o.id===qualityPending.optionId):null;
    return `<div class="ps-form" data-quality-review><strong>Lower-quality audio available</strong>${chosen?`<p class="ps-muted">Download ${esc(chosen.label)} for this song?</p><p class="ps-muted">${esc(chosen.title)} · ${chosen.duration?Math.round(chosen.duration)+'s':'length not reported'}</p><small>${esc(chosen.url || 'Selected local audio file')}</small><p class="ps-muted">This exception is for this song only. ${['opus','vorbis'].includes(chosen.codec)?'Use FLAC for playback, labelled with the original source quality.':'Keep the original audio encoding.'} Your normal audio standard stays unchanged. Length and file checks still apply.</p><div class="ps-form-actions">${button('lower-cancel','Back')}${button('lower-confirm','Confirm & download',row.id,busy||model.active?'disabled':'')}</div>`:`<label>Available file<select data-lower-choice>${options.map(o=>`<option value="${esc(o.id)}">${esc(o.label)} · ${esc(o.title)}</option>`).join('')}</select></label>${button('lower-review','Review lower-quality file',row.id,busy||model.active?'disabled':'')}`}</div>`;
  }
  function matchFields(row) {
    const candidates = row?.candidates || [];
    return candidates.length ? `<label>Existing track<select name="localId" required>${candidates.map(c => `<option value="${esc(c.local.id)}">${esc(c.local.title)} · ${esc(c.local.artist)} · ${Math.round(c.local.duration)}s</option>`).join('')}</select></label><p class="ps-muted">Confirm the recording and mix before saving.</p>` : '<label>rbxport track ID<input name="localId" required></label>';
  }
  function settingsForm() {
    const s = model.settings || {};
    const spotify = model.spotify || {};
    const soulseek = model.soulseek || {};
    return `<div class="ps-form"><form data-form="settings"><label>Download folder<input name="musicFolder" value="${esc(s.musicFolder)}" required></label><label>Audio standard<select name="quality"><option value="strict-mp3-320" ${s.quality!=='club-aac-256'?'selected':''}>MP3 320 kbps / lossless</option><option value="club-aac-256" ${s.quality==='club-aac-256'?'selected':''}>Also allow AAC 256 kbps or higher</option></select></label><details class="ps-more"><summary>Advanced</summary>${[['ytdlp','yt-dlp'],['ffmpeg','FFmpeg'],['ffprobe','FFprobe'],['cookiesFile','SoundCloud cookies file']].map(([key,label]) => `<label>${label}<input name="${key}" value="${esc(s[key])}"></label>`).join('')}<label class="ps-check"><input type="checkbox" name="allowLowerOfficial" ${s.allowLowerOfficial!==false ? 'checked' : ''}> Accept artist-enabled official downloads at their original quality</label><p class="ps-muted">Official originals are tried first and labelled with their actual quality. Lower-quality stream copies still need confirmation. SoundCloud sign-in may be needed for original downloads; supply your cookies file above.</p><label class="ps-check"><input type="checkbox" name="autoAnalyse" ${s.autoAnalyse ? 'checked' : ''}> Analyze new tracks</label><p class="ps-muted">MP3 requires 320 kbps; optional AAC requires 256 kbps. Lossless is accepted. AAC is preserved as M4A; lower-quality audio is never upscaled. Duration and full decoding are checked.</p></details><div class="ps-form-actions">${button('dismiss','Done')}<button>Save</button></div></form>
      <details class="ps-more"><summary>${spotify.connected ? 'Spotify connected' : spotify.status === 'waiting' ? 'Spotify · finish sign-in' : 'Connect Spotify'}</summary><form data-form="spotify">${spotify.message ? `<p class="ps-muted" role="status">${esc(spotify.message)}</p>` : ''}<p class="ps-muted">In the Spotify developer dashboard, register this exact redirect URI. Then use Connect below; the address itself is not a sign-in link.</p><code>http://127.0.0.1:43821/oauth/spotify</code><label>Client ID<input name="clientId" value="${esc(spotify.clientId || '')}" required autocomplete="off"></label><button ${busy ? 'disabled' : ''}>${spotify.connected ? 'Reconnect' : 'Connect'}</button></form></details>
      <details class="ps-more" ${mode === 'soulseek' ? 'open' : ''}><summary>Soulseek fallback${soulseek.enabled ? ' · enabled' : ''}</summary><form data-form="soulseek"><p class="ps-muted">Use an existing Soulseek account. Details are encrypted for your Windows account. The verified helper downloads automatically on first use. Only acquire audio you are entitled to download.</p><label>Username<input name="username" value="${esc(soulseek.username || '')}" required autocomplete="off"></label><label>Password<input name="password" type="password" ${soulseek.configured ? 'placeholder="Leave blank to keep saved password"' : 'required'} autocomplete="new-password"></label><label class="ps-check"><input type="checkbox" name="enabled" ${!soulseek.configured || soulseek.enabled ? 'checked' : ''}> Use as fallback on Sync</label><label class="ps-check"><input type="checkbox" name="allowIncoming" ${soulseek.allowIncoming ? 'checked' : ''}> Allow incoming peer connections</label><p class="ps-muted">Uses a temporary Soulseek listener on TCP 49998 while searching. No file sharing or firewall/router changes. Some peers cannot reply without it.</p><p class="ps-muted">${soulseek.configured ? 'Account saved. A search verifies sign-in. ' : ''}An active Soulseek client may need a separate account. Quality and length checks remain strict.</p><button ${busy ? 'disabled' : ''}>Save account</button></form></details></div>`;
  }
  async function act(action, value = {}) {
    error = ''; busy = true;
    try {
      if (libraryUnavailable() && (libraryActions.has(action) || ['options','automatic','resolve','match-plan','accept-matches','quality-plan','accept-quality'].includes(action))) throw Error(model.connectionError || 'Connect the rbxport library before syncing.');
      return await send(action, value);
    } catch (e) { error = e.message; }
    finally { busy = false; render(true); }
  }
  root.addEventListener('click', async event => {
    const target = event.target.closest('[data-action]'); if (!target) return;
    const { action, id } = target.dataset;
    if(['details','link','settings'].includes(action)){bulkFor=null;bulkPlan=null;bulkNotice='';qualityFor=null;qualityPlan=null;}
    if (action === 'details') { expanded = expanded === id ? null : id; reviewing = null; render(true); if (expanded) await act('select', { id }); }
    else if(action==='bulk-open'){bulkFor=id;bulkAlternates=false;bulkNotice='';reviewing=null;qualityFor=null;qualityPlan=null;await loadBulkPlan();}
    else if(action==='quality-bulk-open'){
      qualityFor=id;qualityPlan=null;bulkFor=null;bulkNotice='';reviewing=null;render(true);
      const result=await act('quality-plan',{id});if(result&&!error)qualityPlan=result;render(true);
      requestAnimationFrame(()=>root.querySelector('[data-bulk-quality]')?.scrollIntoView({block:'nearest'}));
    }
    else if(action==='quality-bulk-dismiss'){qualityFor=null;qualityPlan=null;render(true);}
    else if(action==='quality-bulk-confirm' && qualityPlan){
      const result=await act('accept-quality',{id:qualityFor,signature:qualityPlan.signature});
      if(result&&!error){bulkNotice=result.message;qualityFor=null;qualityPlan=null;render(true);}
    }
    else if(action==='bulk-dismiss'){bulkFor=null;bulkPlan=null;render(true);}
    else if(action==='bulk-confirm' && bulkPlan){
      const result=await act('accept-matches',{id:bulkFor,includeAlternates:bulkPlan.includeAlternates,signature:bulkPlan.signature});
      if(result && !error){bulkNotice=result.message;bulkFor=null;bulkPlan=null;render(true);}
    }
    else if (action === 'link') { mode = mode === 'link' ? '' : 'link'; expanded = null; render(true); if (mode) await act('options'); }
    else if (action === 'settings') { mode = mode === 'settings' ? '' : 'settings'; expanded = null; render(true); }
    else if (action === 'fallback' && !model.soulseek?.enabled) { mode = 'soulseek'; expanded = null; render(true); requestAnimationFrame(() => root.querySelector('[data-form=soulseek]')?.scrollIntoView({block:'nearest'})); }
    else if (action === 'dismiss') { mode = ''; render(true); }
    else if (action === 'review') {
      reviewing = reviewing === id ? null : id; render(true);
      if (reviewing) requestAnimationFrame(() => {
        const form = root.querySelector('[data-form="resolve"]');
        if (form?.dataset.id !== reviewing) return;
        form.scrollIntoView({ block: 'nearest' });
        form.querySelector('select')?.focus({ preventScroll: true });
      });
    }
    else if (action === 'dismiss-review') { reviewing = null; render(true); }
    else if(action==='lower-review'){
      const job=jobsByRow.get(id),optionId=root.querySelector('[data-lower-choice]')?.value || job?.lowerOptions?.[0]?.id;
      if(optionId){qualityPending={rowId:id,optionId};render(true);requestAnimationFrame(()=>root.querySelector('[data-quality-review]')?.scrollIntoView({block:'nearest'}));}
    }
    else if(action==='lower-cancel'){qualityPending=null;render(true);}
    else if(action==='lower-confirm' && qualityPending?.rowId===id){
      const result=await act('resolve',{id,action:'lower',optionId:qualityPending.optionId});
      if(!error){reviewNotices[id]=result?.message || 'Approved for this song. Download starting.';qualityPending=null;render(true);}
    }
    else await act(action, { id });
  });
  root.addEventListener('change', async event => {
    if(event.target.hasAttribute?.('data-bulk-alternates')){bulkAlternates=event.target.checked;await loadBulkPlan();return;}
    if (event.target.dataset.automatic) await act('automatic', { id: event.target.dataset.automatic, automatic: event.target.checked });
    if (event.target.id === 'ps-resolution') {
      const action = event.target.value;
      reviewDrafts[reviewing]={...reviewDrafts[reviewing],action};qualityPending=null;
      const row=rows().find(r=>r.id===reviewing),job=jobsByRow.get(reviewing);
      root.querySelector('#ps-resolution-fields').innerHTML=resolutionFields(action,row,reviewDrafts[reviewing],job);
    }
  });
  root.addEventListener('input',event=>{
    const form=event.target.closest?.('[data-form="resolve"]');if(!form || !event.target.name)return;
    reviewDrafts[form.dataset.id]={...reviewDrafts[form.dataset.id],[event.target.name]:event.target.value};qualityPending=null;
  });
  root.addEventListener('toggle',event=>{
    const id=event.target.dataset?.allTracks;if(!id)return;
    const next=event.target.open?id:null;if(allFor===next)return;allFor=next;render(true);
  },true);
  root.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.target; const value = Object.fromEntries(new FormData(form));
    if (form.dataset.form === 'settings') { value.autoAnalyse = form.elements.autoAnalyse.checked; value.allowLowerOfficial=form.elements.allowLowerOfficial.checked; }
    if (form.dataset.form === 'soulseek') { value.enabled = form.elements.enabled.checked; value.allowIncoming=form.elements.allowIncoming.checked; }
    if (form.dataset.form === 'resolve') {value.id = form.dataset.id;reviewDrafts[value.id]={...value};}
    const result=await act(form.dataset.form, value);
    if(form.dataset.form==='resolve'){
      if(!error){reviewNotices[value.id]=result?.message || 'Saved your choice.';render(true);}
      return;
    }
    if (!error) { mode = ['spotify','soulseek'].includes(form.dataset.form) ? 'settings' : ''; reviewing = null; render(true); }
  });
  const controller = { update(value) {
    const connectionChanged = value.connected !== model.connected || value.connectionError !== model.connectionError;
    const selectionChanged = value.selectionRevision !== model.selectionRevision && value.selected;
    if (selectionChanged) { expanded = value.selected; reviewing = null; mode = '';bulkFor=null;bulkPlan=null;bulkNotice='';qualityFor=null;qualityPlan=null; }
    model = value;jobsByRow=new Map((value.jobs || []).map(job=>[job.rowId,job])); render(Boolean(selectionChanged || connectionChanged));
  }, showError(message) { error = message; busy = false; render(true); }, collapse() { expanded = null; mode = ''; reviewing = null; error = '';bulkFor=null;bulkPlan=null;bulkNotice='';qualityFor=null;qualityPlan=null; render(true); } };
  root.playlistSyncPanel = controller; render(); return controller;
}
