" Guard against double-loading
if exists('g:loaded_overleaf')
  finish
endif
let g:loaded_overleaf = 1

autocmd User DenopsPluginPost:overleaf call s:on_ready()

function! s:on_ready() abort
  " Main commands
  command! -nargs=* OverleafInit call s:init(<q-args>)
  command! -nargs=? OverleafSync call s:sync(<q-args>)
  command! -nargs=0 OverleafOpen call s:open()
  command! -nargs=0 OverleafStatus call s:show_status()
  command! -nargs=0 OverleafDisconnect call denops#request('overleaf', 'disconnect', [])
  command! -nargs=1 OverleafLogLevel call denops#request('overleaf', 'setLogLevel', [<q-args>])
endfunction

" --- OverleafInit: first-time project setup ---
" Usage: :OverleafInit [cookie] [projectId]
function! s:init(args) abort
  let l:parts = split(a:args)
  let l:cookie = ''
  let l:project_id = ''

  if len(l:parts) >= 2
    let l:cookie = l:parts[0]
    let l:project_id = l:parts[1]
  elseif len(l:parts) == 1
    let l:cookie = s:get_cookie()
    let l:project_id = l:parts[0]
  endif

  if empty(l:cookie)
    let l:cookie = s:get_cookie()
  endif
  if empty(l:cookie)
    let l:cookie = input('Overleaf cookie: ')
    redraw
  endif
  if empty(l:cookie)
    echohl WarningMsg | echomsg 'Cancelled' | echohl None
    return
  endif

  if empty(l:project_id)
    let l:project_id = input('Project ID (from Overleaf URL): ')
    redraw
  endif
  if empty(l:project_id)
    echohl WarningMsg | echomsg 'Cancelled' | echohl None
    return
  endif

  call denops#request('overleaf', 'init', [l:cookie, l:project_id])
endfunction

" --- OverleafSync: connect + sync files ---
" Reads .overleaf/config.json (including saved cookie). Just works.
" Usage: :OverleafSync [cookie]  (cookie optional — uses saved one)
function! s:sync(cookie) abort
  if !filereadable('.overleaf/config.json')
    echohl WarningMsg
    echomsg 'No .overleaf/config.json found. Run :OverleafInit first.'
    echohl None
    return
  endif

  " Pass cookie if given, otherwise Deno side uses saved cookie from config
  let l:cookie = a:cookie
  if empty(l:cookie)
    let l:cookie = s:get_cookie()
  endif

  call denops#request('overleaf', 'sync', [l:cookie])
endfunction

" --- OverleafOpen: pick a file and open for real-time editing ---
function! s:open() abort
  let l:tree = denops#request('overleaf', 'getFileTree', [])
  if empty(l:tree)
    echomsg 'Not connected. Run :OverleafSync first.'
    return
  endif

  let l:docs = []
  for l:entry in l:tree
    if l:entry.type ==# 'doc'
      call add(l:docs, l:entry)
    endif
  endfor

  if empty(l:docs)
    echomsg 'No documents in project'
    return
  endif

  let l:items = ['Select document:']
  let l:idx = 1
  for l:doc in l:docs
    call add(l:items, l:idx .. '. ' .. l:doc.path)
    let l:idx += 1
  endfor

  let l:choice = inputlist(l:items)
  if l:choice > 0 && l:choice <= len(l:docs)
    let l:selected = l:docs[l:choice - 1]
    call timer_start(0, {-> denops#request('overleaf', 'openDoc', [l:selected.id, l:selected.path])})
  endif
endfunction

" --- Status ---
function! s:show_status() abort
  try
    let l:status = denops#request('overleaf', 'getStatus', [])
  catch
    echo 'Overleaf: not loaded'
    return
  endtry
  echo 'Overleaf Status:'
  echo '  State:       ' .. l:status.state
  if !empty(l:status.projectName)
    echo '  Project:     ' .. l:status.projectName
    echo '  Permissions: ' .. l:status.permissions
    echo '  Synced files:' .. l:status.syncedFiles
  endif
endfunction

" --- Helpers ---
function! s:get_cookie() abort
  return $OVERLEAF_COOKIE
endfunction

" Statusline function
function! overleaf#statusline() abort
  try
    let l:state = denops#request('overleaf', 'getState', [])
    if l:state ==# 'connected'
      return '[OL:ok]'
    elseif l:state ==# 'reconnecting'
      return '[OL:...]'
    elseif l:state ==# 'disconnected'
      return ''
    else
      return '[OL:' .. l:state .. ']'
    endif
  catch
    return ''
  endtry
endfunction
