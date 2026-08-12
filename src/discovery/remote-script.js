export const REMOTE_DISCOVERY = String.raw`
import glob,json,os,re,subprocess,sys,pwd

def run(args, timeout=4):
    try:
        p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=timeout,check=False)
        return (p.stdout or '').strip()
    except Exception:
        return ''

def pidof(name):
    out=run(['pgrep','-xo',name]) or run(['pgrep','-f','(^|/)'+re.escape(name)+'( |$)'])
    for x in out.splitlines():
        if x.strip().isdigit(): return int(x.strip())
    return None

def proc_exe(pid):
    try: return os.path.realpath('/proc/%d/exe'%pid) if pid else ''
    except Exception: return ''

def proc_cwd(pid):
    try: return os.path.realpath('/proc/%d/cwd'%pid) if pid else ''
    except Exception: return ''

def proc_args(pid):
    if not pid:return []
    try:
        return [x.decode(errors='replace') for x in open('/proc/%d/cmdline'%pid,'rb').read().split(b'\0') if x]
    except Exception:return []

def proc_home(pid):
    try:
        return pwd.getpwuid(os.stat('/proc/%d'%pid).st_uid).pw_dir if pid else os.path.expanduser('~')
    except Exception:
        return os.path.expanduser('~')

def arg_value(args, name):
    for i,a in enumerate(args):
        if a.startswith(name+'='): return a.split('=',1)[1]
        if a==name and i+1<len(args): return args[i+1]
    return ''

def first_file(paths):
    seen=set()
    for raw in paths:
        if not raw: continue
        p=os.path.abspath(os.path.expanduser(raw))
        if p in seen: continue
        seen.add(p)
        if os.path.isfile(p): return p
    return ''

def unit_for_pid(pid):
    if not pid:return ''
    text=run(['systemctl','status',str(pid),'--no-pager'])
    m=re.search(r'([A-Za-z0-9_.@-]+\.service)',text)
    return m.group(1) if m else ''

def fallback_unit(pattern):
    text=run(['systemctl','list-units','--type=service','--all','--no-legend'])
    for line in text.splitlines():
        unit=(line.strip().split() or [''])[0]
        if re.search(pattern,unit,re.I):return unit
    return ''

def version(exe):
    return run([exe,'--version']) .splitlines()[0] if exe and os.access(exe,os.X_OK) and run([exe,'--version']) else ''

xp=pidof('xmrig'); pp=pidof('p2pool'); mp=pidof('monerod')
xe=proc_exe(xp); pe=proc_exe(pp); me=proc_exe(mp)
xcwd=proc_cwd(xp); pcwd=proc_cwd(pp); mcwd=proc_cwd(mp)
xargs=proc_args(xp); pargs=proc_args(pp); margs=proc_args(mp)
xcfg=''
for i,a in enumerate(xargs):
    if a.startswith('--config='): xcfg=a.split('=',1)[1]
    elif a in ('-c','--config') and i+1<len(xargs): xcfg=xargs[i+1]
if not xcfg and xcwd and os.path.isfile(os.path.join(xcwd,'config.json')): xcfg=os.path.join(xcwd,'config.json')
if not xcfg:
    candidates=['/opt/xmrig/config.json']+glob.glob(os.path.expanduser('~/xmrig*/config.json'))+glob.glob('/home/*/xmrig*/config.json')
    xcfg=next((p for p in candidates if os.path.isfile(p)),'')
if not xe and xcfg:
    candidate=os.path.join(os.path.dirname(xcfg),'xmrig')
    if os.path.isfile(candidate): xe=candidate

# Component log files. Prefer real files over a shared systemd unit because one mining.service
# can launch monerod, p2pool and XMRig together.
phome=proc_home(pp)
p2log=first_file([
    os.path.join(phome,'p2pool.log'),
    os.path.join(pcwd,'p2pool.log') if pcwd else '',
    '/var/log/p2pool.log',
] + glob.glob('/home/*/p2pool.log'))

mhome=proc_home(mp)
mlog=arg_value(margs,'--log-file')
mdata=arg_value(margs,'--data-dir')
if mlog and not os.path.isabs(mlog):
    mlog=os.path.join(mcwd or mhome,mlog)
if not mlog:
    candidates=[]
    if mdata:
        if not os.path.isabs(mdata): mdata=os.path.join(mcwd or mhome,mdata)
        candidates += [os.path.join(mdata,'bitmonero.log'),os.path.join(mdata,'monero.log')]
    candidates += [
        os.path.join(mhome,'.bitmonero','bitmonero.log'),
        '/var/log/monero/monero.log',
        '/var/log/monerod.log',
    ] + glob.glob('/home/*/.bitmonero/bitmonero.log')
    mlog=first_file(candidates)
else:
    mlog=first_file([mlog]) or mlog

api_port=None
if xcfg:
    try:
        c=json.load(open(xcfg)); api_port=int((c.get('http') or {}).get('port') or 0) or None
    except Exception:pass
cpu_model=''
for line in run(['lscpu']).splitlines():
    if line.startswith('Model name:'):cpu_model=line.split(':',1)[1].strip();break
if not cpu_model:
    try:
        for line in open('/proc/cpuinfo',errors='ignore'):
            if line.lower().startswith('model name'):cpu_model=line.split(':',1)[1].strip();break
    except Exception:pass
mem_kb=0
try:
    for line in open('/proc/meminfo'):
        if line.startswith('MemTotal:'):mem_kb=int(line.split()[1]);break
except Exception:pass
numa=None
m=re.search(r'NUMA node\(s\):\s*(\d+)',run(['lscpu']))
if m:numa=int(m.group(1))
os_name='Linux'
try:
    vals={}
    for line in open('/etc/os-release'):
        if '=' in line:
            k,v=line.rstrip().split('=',1);vals[k]=v.strip('"')
    os_name=vals.get('PRETTY_NAME',os_name)
except Exception:pass
res={
 'xmrig':{'pid':xp,'binary':xe,'cwd':xcwd,'config':xcfg,'command':' '.join(xargs),'service':unit_for_pid(xp) or fallback_unit(r'(xmrig|mining)\.service$'),'apiPort':api_port,'version':version(xe)},
 'p2pool':{'pid':pp,'binary':pe,'cwd':pcwd,'command':' '.join(pargs),'service':unit_for_pid(pp) or fallback_unit(r'p2pool\.service$'),'version':version(pe),'logPath':p2log},
 'monerod':{'pid':mp,'binary':me,'cwd':mcwd,'command':' '.join(margs),'service':unit_for_pid(mp) or fallback_unit(r'monerod\.service$'),'version':version(me),'logPath':mlog},
 'hardware':{'cpuModel':cpu_model,'memoryBytes':mem_kb*1024,'numaNodes':numa,'os':os_name,'arch':run(['uname','-m']),'kernel':run(['uname','-r'])}
}
print(json.dumps(res,ensure_ascii=False))
`;
