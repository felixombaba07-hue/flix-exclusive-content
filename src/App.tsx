import { useEffect, useMemo, useState } from 'react';
import { auth, type AuthUser } from '@appdeploy/client';
import { api } from '@appdeploy/client';
import {
  ArrowRight,
  BadgeCheck,
  Clapperboard,
  Crown,
  Film,
  LockKeyhole,
  LogOut,
  Play,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Video,
  Upload,
  X,
} from 'lucide-react';

type VideoItem = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  createdAt?: string;
  views?: number;
  likes?: number;
  comments?: number;
};
type Plan = { id: string; name: string; amount: number; days: number; discountPercent: number };
type Application = {
  id: string;
  userId: string;
  name: string;
  facebookName: string;
  status: string;
  createdAt?: string;
};
type Member = {
  id: string;
  userId: string;
  name?: string;
  status: string;
  approvedAt?: string;
};
type Me = {
  user: { userId: string; email?: string; name?: string };
  isAdmin: boolean;
  membership: Member | null;
  application: Application | null;
  facebookUrl: string;
  paidAccess?: { active: boolean; planName?: string; activeUntil?: string | null };
};
type AdminData = {
  facebookUrl: string;
  videos: VideoItem[];
  applications: Application[];
  members: Member[];
};

const apiError = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Please try again.';

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [libraryVideos, setLibraryVideos] = useState<VideoItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCover, setSelectedCover] = useState<File | null>(null);
  const [subscribeModal, setSubscribeModal] = useState(false);
  const [paywallVideo, setPaywallVideo] = useState<VideoItem | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('daily');
  const [paymentNotice, setPaymentNotice] = useState('');
  const [tab, setTab] = useState<'library' | 'profile' | 'watchlist' | 'admin'>('library');
  const [publicPlans, setPublicPlans] = useState<Plan[]>([]);
  const [pricingDraft, setPricingDraft] = useState<Plan[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [watchlistVideos, setWatchlistVideos] = useState<VideoItem[]>([]);
  const [editingVideoId, setEditingVideoId] = useState('');
  const [editVideoDraft, setEditVideoDraft] = useState({ title: '', description: '', category: '' });
  const [selected, setSelected] = useState<VideoItem | null>(null);
  const [videoComments, setVideoComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [liked, setLiked] = useState(false);
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [facebookName, setFacebookName] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [videoForm, setVideoForm] = useState({
    title: '',
    description: '',
    category: 'Exclusive',
    videoUrl: '',
    thumbnailUrl: '',
  });

  const refresh = async (currentUser?: AuthUser | null) => {
    const activeUser = currentUser === undefined ? user : currentUser;
    if (!activeUser) {
      setMe(null);
      setAdmin(null);
      setLibraryVideos([]);
      return;
    }
    const publicResult = await api.get('/api/public/videos');
    setLibraryVideos(publicResult.data.videos || []);
    const result = await api.get('/api/me');
    setMe(result.data as Me);
    const favoritesResult = await api.get('/api/member/favorites');
    setFavoriteIds(favoritesResult.data.videoIds || []);
    setWatchlistVideos(favoritesResult.data.videos || []);
    if (result.data.isAdmin) {
      const adminResult = await api.get('/api/admin/overview');
      setAdmin(adminResult.data as AdminData);
      setLibraryVideos(adminResult.data.videos || []);
      setFacebookUrl(adminResult.data.facebookUrl || '');
    } else {
      setAdmin(null);
      // The public catalogue contains metadata only; video URLs are returned after member authorization.
    }
  };

  useEffect(() => {
    api.get('/api/public/videos').then(result => setLibraryVideos(result.data.videos || [])).catch(() => {});
    api.get('/api/public/config').then(result => { setFacebookUrl(result.data.facebookUrl || ''); setPublicPlans(result.data.plans || []); }).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    auth
      .getUser()
      .then(async restored => {
        if (!alive) return;
        setUser(restored);
        if (restored) {
          try {
            await refresh(restored);
          } catch (e) {
            setErrorMessage(apiError(e));
          }
        }
        if (alive) setLoading(false);
      })
      .catch(e => {
        if (alive) {
          setErrorMessage(apiError(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const signIn = async () => {
    setErrorMessage('');
    try {
      await auth.signInWithRedirect();
    } catch (e) {
      setErrorMessage(apiError(e));
    }
  };

  const signOut = async () => {
    await auth.signOut();
    setUser(null);
    setMe(null);
    setAdmin(null);
    setLibraryVideos([]);
    setSelected(null);
    setTab('library');
  };

  const apply = async () => {
    if (!displayName.trim() || !facebookName.trim()) {
      setErrorMessage(
        'Enter your name and Facebook subscriber name to request access.'
      );
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      await api.post('/api/applications', {
        name: displayName.trim(),
        facebookName: facebookName.trim(),
      });
      await refresh();
    } catch (e) {
      setErrorMessage(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveFacebook = async () => {
    setBusy(true);
    setErrorMessage('');
    try {
      await api.put('/api/admin/settings', { facebookUrl });
      await refresh();
    } catch (e) {
      setErrorMessage(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const addVideo = async () => {
    if (!videoForm.title.trim() || !selectedFile) {
      setErrorMessage('Choose a video file and enter its title.');
      return;
    }
    if (selectedFile.size > 4 * 1024 * 1024) {
      setErrorMessage('This direct uploader supports videos up to 4 MB. Use a compressed short clip or a dedicated video host for larger videos.');
      return;
    }
    if (selectedCover && (!['image/jpeg', 'image/png', 'image/webp'].includes(selectedCover.type) || selectedCover.size > 4 * 1024 * 1024)) {
      setErrorMessage('Choose a JPG, PNG or WebP cover image up to 4 MB.');
      return;
    }
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(selectedFile.type)) {
      setErrorMessage('Choose an MP4, WebM or MOV video file.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read video file.'));
        reader.onerror = () => reject(new Error('Could not read video file.'));
        reader.readAsDataURL(selectedFile);
      });
      const base64Data = dataUrl.split(',')[1];
      let coverBase64 = '';
      if (selectedCover) {
        const coverDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read cover image.'));
          reader.onerror = () => reject(new Error('Could not read cover image.'));
          reader.readAsDataURL(selectedCover);
        });
        coverBase64 = coverDataUrl.split(',')[1];
      }
      await api.post('/api/admin/videos/upload', {
        title: videoForm.title,
        description: videoForm.description,
        category: videoForm.category,
        coverBase64,
        coverFileName: selectedCover?.name || '',
        coverContentType: selectedCover?.type || '',
        fileName: selectedFile.name,
        contentType: selectedFile.type,
        base64Data,
      });
      setVideoForm({ title: '', description: '', category: 'Exclusive', videoUrl: '', thumbnailUrl: '' });
      setSelectedFile(null);
      setSelectedCover(null);
      const coverInput = document.getElementById('cover-upload') as HTMLInputElement | null;
      if (coverInput) coverInput.value = '';
      const fileInput = document.getElementById('video-upload') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
      await refresh();
    } catch (e) {
      setErrorMessage(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const playVideo = async (video: VideoItem) => {
    if (!me?.isAdmin && !me?.paidAccess?.active) {
      if (!user) {
        setErrorMessage('Please sign in before purchasing video access.');
        await signIn();
        return;
      }
      setPaywallVideo(video);
      setSelectedPlanId('daily');
      setSubscribeModal(true);
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const result = await api.get('/api/member/videos/' + encodeURIComponent(video.id));
      await api.post('/api/member/videos/' + encodeURIComponent(video.id) + '/view', {});
      const commentsResult = await api.get('/api/member/videos/' + encodeURIComponent(video.id) + '/comments');
      setVideoComments(commentsResult.data.comments || []);
      setLiked(!!commentsResult.data.liked);
      setSelected({ ...video, views: (video.views || 0) + 1, videoUrl: result.data.videoUrl });
    } catch (e) {
      setErrorMessage(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const startCheckout = async () => {
    if (!paywallVideo) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const result = await api.post('/api/payments/initialize', { planId: selectedPlanId, videoId: paywallVideo.id });
      window.location.href = result.data.authorizationUrl;
    } catch (e) {
      setErrorMessage(apiError(e));
      setBusy(false);
    }
  };

  const verifyReturnedPayment = async (reference: string, videoId: string) => {
    setBusy(true);
    try {
      const result = await api.post('/api/payments/verify', { reference });
      if (result.data.verified) {
        setMe(current => current ? { ...current, paidAccess: { ...result.data.access, active: true } } : current);
        setPaymentNotice('Payment verified. Your access is now active.');
        setSubscribeModal(false);
        if (videoId) {
          const video = libraryVideos.find(item => item.id === videoId);
          if (video) {
            const playback = await api.get('/api/member/videos/' + encodeURIComponent(video.id));
            await api.post('/api/member/videos/' + encodeURIComponent(video.id) + '/view', {});
            const comments = await api.get('/api/member/videos/' + encodeURIComponent(video.id) + '/comments');
            setVideoComments(comments.data.comments || []);
            setLiked(!!comments.data.liked);
            setSelected({ ...video, views: (video.views || 0) + 1, videoUrl: playback.data.videoUrl });
          }
        }
      }
    } catch (e) {
      setPaymentNotice(apiError(e));
    } finally {
      setBusy(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    if (user && params.get('payment') === 'success' && reference) {
      void verifyReturnedPayment(reference, params.get('videoId') || '');
    }
  }, [user]);

  const toggleLike = async () => {
    if (!selected) return;
    try {
      const result = await api.post('/api/member/videos/' + encodeURIComponent(selected.id) + '/like', {});
      setLiked(!!result.data.liked);
      setSelected({ ...selected, likes: Math.max(0, (selected.likes || 0) + (result.data.liked ? 1 : -1)) });
    } catch (e) { setErrorMessage(apiError(e)); }
  };

  const postComment = async () => {
    if (!selected || !commentText.trim()) return;
    try {
      await api.post('/api/member/videos/' + encodeURIComponent(selected.id) + '/comments', { text: commentText.trim() });
      const result = await api.get('/api/member/videos/' + encodeURIComponent(selected.id) + '/comments');
      setVideoComments(result.data.comments || []);
      setSelected({ ...selected, comments: (selected.comments || 0) + 1 });
      setCommentText('');
    } catch (e) { setErrorMessage(apiError(e)); }
  };

  const memberAction = async (
    userId: string,
    action: 'approve' | 'reject' | 'revoke'
  ) => {
    setBusy(true);
    setErrorMessage('');
    try {
      await api.post('/api/admin/members/' + encodeURIComponent(userId), {
        action,
      });
      await refresh();
    } catch (e) {
      setErrorMessage(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = async (video: VideoItem) => {
    if (!user) { setErrorMessage('Sign in to save videos to your watchlist.'); return; }
    try {
      const result = await api.put('/api/member/favorites/' + encodeURIComponent(video.id), {});
      setFavoriteIds(current => result.data.favorited ? [...current, video.id] : current.filter(id => id !== video.id));
      setWatchlistVideos(current => result.data.favorited ? [...current.filter(item => item.id !== video.id), video] : current.filter(item => item.id !== video.id));
    } catch (e) { setErrorMessage(apiError(e)); }
  };

  const savePlanPrices = async () => {
    setBusy(true);
    try {
      const result = await api.put('/api/admin/plans', { plans: pricingDraft });
      setPricingDraft(result.data.plans || []);
      setPublicPlans(result.data.plans || []);
      setPaymentNotice('Plan prices and discounts saved.');
    } catch (e) { setErrorMessage(apiError(e)); }
    finally { setBusy(false); }
  };

  const beginVideoEdit = (video: VideoItem) => {
    setEditingVideoId(video.id);
    setEditVideoDraft({ title: video.title, description: video.description || '', category: video.category || 'Exclusive' });
  };

  const saveVideoEdit = async (id: string) => {
    setBusy(true);
    try {
      await api.put('/api/admin/videos/' + encodeURIComponent(id), editVideoDraft);
      setEditingVideoId('');
      await refresh();
      setPaymentNotice('Video details updated.');
    } catch (e) { setErrorMessage(apiError(e)); }
    finally { setBusy(false); }
  };

  const deleteVideo = async (id: string) => {
    if (!window.confirm('Remove this video from the member library?')) return;
    setBusy(true);
    setErrorMessage('');
    try {
      await api.delete('/api/admin/videos/' + encodeURIComponent(id));
      await refresh();
    } catch (e) {
      setErrorMessage(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const videos = me?.isAdmin ? admin?.videos || [] : libraryVideos;
  const categories = useMemo(
    () => Array.from(new Set(videos.map(v => v.category || 'Exclusive'))),
    [videos]
  );

  if (loading)
    return (
      <div className="loading-screen">
        <img className="flix-logo-loading" src="/resources/flix-logo.png" alt="Flix Exclusive Content" />
        <p>Preparing your private cinema…</p>
      </div>
    );

  if (!user && false)
    return (
      <main className="auth-shell">
        <div className="auth-art">
          <div className="grain" />
          <div className="auth-top">
            <div className="brand">
              <span className="brand-mark">
                <Clapperboard size={22} />
              </span>
              <span>
                FLIX <b>EXCLUSIVE</b>
              </span>
            </div>
            <span className="top-pill">
              <LockKeyhole size={13} /> PRIVATE MEMBERSHIP
            </span>
          </div>
          <div className="auth-copy">
            <div className="eyebrow">
              <Sparkles size={14} /> YOUR PRIVATE SCREENING ROOM
            </div>
            <h1>
              Stories worth
              <br />
              <em>keeping exclusive.</em>
            </h1>
            <p>
              A private destination for members-only films, lessons and premium
              video drops.
            </p>
            <div className="auth-proof">
              <span>
                <ShieldCheck size={16} /> Members-only access
              </span>
              <span>
                <BadgeCheck size={16} /> Curated releases
              </span>
            </div>
          </div>
          <div className="poster-stack">
            <div className="poster poster-one">
              <span>
                THE
                <br />
                EXCLUSIVE
                <br />
                CUT
              </span>
              <small>FLIX ORIGINALS</small>
            </div>
            <div className="poster poster-two">
              <span>
                BEHIND
                <br />
                THE SCENES
              </span>
              <small>MEMBER PREMIERE</small>
            </div>
            <div className="poster poster-three">
              <span>
                AFTER
                <br />
                HOURS
              </span>
              <small>PRIVATE SERIES</small>
            </div>
          </div>
          <div className="auth-foot">
            <span>© FLIX EXCLUSIVE CONTENT</span>
            <span>CONTENT FOR MEMBERS ONLY</span>
          </div>
        </div>
        <section className="auth-panel">
          <div className="panel-inner">
            <div className="mobile-brand">
              <span className="brand-mark">
                <Clapperboard size={22} />
              </span>{' '}
              FLIX <b>EXCLUSIVE</b>
            </div>
            <div className="panel-icon">
              <Crown size={23} />
            </div>
            <div className="eyebrow">WELCOME TO THE INNER CIRCLE</div>
            <h2>
              Unlock your
              <br />
              private library.
            </h2>
            <p className="muted">
              Sign in to purchase a time-based access pass and watch exclusive videos.
            </p>
            <button className="primary-btn wide" onClick={signIn}>
              Sign in to continue <ArrowRight size={17} />
            </button>
            <div className="divider-label">
              <span /> MEMBERSHIP ACCESS <span />
            </div>
            <div className="access-note">
              <LockKeyhole size={18} />
              <div>
                <b>Private by design</b>
                <small>
                  Only visitors with an active paid access pass can watch exclusive videos.
                </small>
              </div>
            </div>
            <p className="small-muted">
              New here? Sign in, choose a video, and select the access pass that suits you.
            </p>
            {errorMessage && <div className="alert">{errorMessage}</div>}
          </div>
          <div className="panel-bottom">
            Secure member sign-in · Flix Exclusive Content
          </div>
        </section>
      </main>
    );

  const isMember = !!me?.paidAccess?.active || !!me?.isAdmin;
  const applicationPending = me?.application?.status === 'pending';
  const applicationRejected = me?.application?.status === 'rejected';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="flix-site-logo" src="/resources/flix-logo.png" alt="Flix Exclusive Content" />
        </div>
        <nav className="nav-links">
          <button
            className={tab === 'library' ? 'nav-active' : ''}
            onClick={() => setTab('library')}
          >
            <Film size={16} /> Library
          </button>
          {user && <button className={tab === 'profile' ? 'nav-active' : ''} onClick={() => setTab('profile')}><Users size={16} /> Profile</button>}
          {user && <button className={tab === 'watchlist' ? 'nav-active' : ''} onClick={() => setTab('watchlist')}><BadgeCheck size={16} /> Watchlist</button>}
          {me?.isAdmin && (
            <button
              className={tab === 'admin' ? 'nav-active' : ''}
              onClick={() => setTab('admin')}
            >
              <Settings size={16} /> Admin studio
            </button>
          )}
        </nav>
        <div className="account">
          <span className="online-dot" />
          <span className="account-name">
            {me?.user?.name || me?.user?.email || 'Member'}
          </span>
          <button className="icon-btn" onClick={user ? signOut : signIn} aria-label={user ? 'Sign out' : 'Sign in'}>
            <LogOut size={17} />
          </button>
        </div>
      </header>
      {errorMessage && (
        <div className="toast-error">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {tab === 'profile' && user ? (
        <main className="member-page profile-page"><section className="welcome-banner"><div><div className="eyebrow">YOUR ACCOUNT</div><h1>Your <em>profile.</em></h1><p>{me?.user?.email || me?.user?.name || 'Flix member'}</p></div><span className="member-chip"><Crown size={15}/> MEMBER</span></section>
          <section className="admin-card profile-plan-card"><div className="eyebrow">SUBSCRIPTION / ACCESS PASS</div><h2>{me?.isAdmin ? 'Owner access' : me?.paidAccess?.active ? (me.paidAccess.planName || 'Active plan') : 'No active plan'}</h2><p>{me?.isAdmin ? 'Administrator account with full library access.' : me?.paidAccess?.active ? 'Your paid access is active.' : 'Choose a video and purchase an access pass to unlock playback.'}</p><div className="profile-plan-details"><div><small>STATUS</small><b>{me?.isAdmin ? 'ADMIN' : me?.paidAccess?.active ? 'ACTIVE' : 'INACTIVE'}</b></div><div><small>EXPIRES</small><b>{me?.isAdmin ? 'No expiry' : me?.paidAccess?.active && me.paidAccess.activeUntil ? new Date(me.paidAccess.activeUntil).toLocaleString() : '—'}</b></div></div><button className="primary-btn" onClick={() => setTab('library')}>Browse library <ArrowRight size={16}/></button></section>
        </main>
      ) : tab === 'watchlist' && user ? (
        <main className="member-page"><section className="library-section"><div className="library-heading"><div><div className="eyebrow">SAVED FOR LATER</div><h2>Your <em>watchlist.</em></h2></div><span className="library-count">{watchlistVideos.length} SAVED</span></div>{watchlistVideos.length ? <div className="video-grid">{watchlistVideos.map(video => <div className="watchlist-card" key={video.id}><button className="video-card" onClick={() => playVideo(video)}><div className="video-thumb">{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt=""/> : <div className="thumb-placeholder"><Clapperboard size={28}/></div>}<span className="play-overlay"><Play size={19}/></span></div><div className="video-card-copy"><b>{video.title}</b><small>{video.category || 'Exclusive'}</small></div></button><button className="secondary-btn" onClick={() => toggleFavorite(video)}>Remove from watchlist</button></div>)}</div> : <div className="empty-library"><h3>Your watchlist is empty.</h3><p>Save videos from the library to keep them here.</p><button className="primary-btn" onClick={() => setTab('library')}>Browse library</button></div>}</section></main>
      ) : tab === 'admin' && me?.isAdmin ? (
        <main className="admin-page">
          <div className="page-heading">
            <div>
              <div className="eyebrow">CONTROL ROOM / OWNER ACCESS</div>
              <h1>
                Admin <em>studio.</em>
              </h1>
              <p>
                Manage video releases and monitor the exclusive library.
              </p>
            </div>
            <span className="admin-tag">
              <ShieldCheck size={15} /> OWNER
            </span>
          </div>
          <section className="admin-grid">
            <div className="admin-card span-two"><div className="card-heading"><div className="card-icon"><Settings size={18}/></div><div><h3>Access plan pricing</h3><p>Change prices and offer percentage discounts. Discounts apply at checkout.</p></div></div><div className="pricing-admin-list">{pricingDraft.map((plan, index) => <div className="pricing-admin-row" key={plan.id}><div><b>{plan.name}</b><small>{plan.days} day{plan.days === 1 ? '' : 's'} access</small></div><label>PRICE (KSh)<input type="number" min="1" max="1000000" value={plan.amount} onChange={e => setPricingDraft(items => items.map((item, i) => i === index ? { ...item, amount: Number(e.target.value) } : item))}/></label><label>DISCOUNT (%)<input type="number" min="0" max="90" value={plan.discountPercent} onChange={e => setPricingDraft(items => items.map((item, i) => i === index ? { ...item, discountPercent: Number(e.target.value) } : item))}/></label><div><small>Customer pays</small><b>KSh {Math.max(1, Math.round(plan.amount * (1 - plan.discountPercent / 100))).toLocaleString()}</b></div></div>)}</div><button className="primary-btn" disabled={busy || !pricingDraft.length} onClick={savePlanPrices}>Save prices & discounts</button></div>
            {false && <div className="admin-card span-two">
              <div className="card-heading">
                <div className="card-icon">
                  <Settings size={18} />
                </div>
                <div>
                  <h3>Facebook subscription link</h3>
                  <p>
                    Where visitors go to subscribe before requesting access.
                  </p>
                </div>
              </div>
              <label>FACEBOOK SUBSCRIPTION URL</label>
              <div className="inline-form">
                <input
                  value={facebookUrl}
                  onChange={e => setFacebookUrl(e.target.value)}
                  placeholder="https://www.facebook.com/.../subscribe"
                />
                <button
                  className="primary-btn"
                  disabled={busy}
                  onClick={saveFacebook}
                >
                  Save link
                </button>
              </div>
              <small className="helper">
                Facebook membership is no longer used for video access.
              </small>
            </div>}
            <div className="admin-card">
              <div className="card-heading">
                <div className="card-icon">
                  <Video size={18} />
                </div>
                <div>
                  <h3>Upload a video</h3>
                  <p>Choose a video file from your phone or computer.</p>
                </div>
              </div>
              <label>VIDEO TITLE</label>
              <input
                value={videoForm.title}
                onChange={e =>
                  setVideoForm({ ...videoForm, title: e.target.value })
                }
                placeholder="e.g. Exclusive market breakdown"
              />
              <label>CHOOSE VIDEO FROM YOUR DEVICE</label>
              <input
                id="video-upload"
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={e => setSelectedFile(e.target.files?.[0] || null)}
              />
              <small className="file-hint">
                Select an MP4, WebM or MOV file. Direct upload limit: 4 MB per video.
              </small>
              <label>UPLOAD COVER PHOTO (OPTIONAL)</label>
              <input
                id="cover-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={e => setSelectedCover(e.target.files?.[0] || null)}
              />
              <small className="file-hint">Choose a JPG, PNG or WebP image from your phone. Maximum 4 MB. It will appear as the video cover in the library.</small>
              <label>CATEGORY</label>
              <input
                value={videoForm.category}
                onChange={e =>
                  setVideoForm({ ...videoForm, category: e.target.value })
                }
                placeholder="Exclusive"
              />
              <label>DESCRIPTION</label>
              <textarea
                rows={3}
                value={videoForm.description}
                onChange={e =>
                  setVideoForm({ ...videoForm, description: e.target.value })
                }
                placeholder="What members will learn or watch…"
              />
              <button
                className="primary-btn wide"
                disabled={busy}
                onClick={addVideo}
              >
                <Upload size={16} /> {busy ? 'Uploading video…' : 'Upload & publish video'}
              </button>
              <small className="helper">
                Your uploaded video is saved to private app storage and appears in the catalogue as a locked preview. Viewers purchase a Paystack access pass before playback.
              </small>
            </div>
            {false && <div className="admin-card">
              <div className="card-heading">
                <div className="card-icon">
                  <Users size={18} />
                </div>
                <div>
                  <h3>Membership requests</h3>
                  <p>Verify Facebook subscriptions, then approve access.</p>
                </div>
              </div>
              <div className="request-list">
                {(admin?.applications || []).length === 0 ? (
                  <div className="empty-small">No membership requests yet.</div>
                ) : (
                  admin?.applications.map(a => (
                    <div className="request-row" key={a.id}>
                      <div className="request-avatar">
                        {(a.name || 'M').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="request-info">
                        <b>{a.name}</b>
                        <small>Facebook: {a.facebookName}</small>
                        <small>{a.status}</small>
                      </div>
                      <div className="request-actions">
                        {a.status === 'pending' && (
                          <>
                            <button
                              className="approve-btn"
                              disabled={busy}
                              onClick={() => memberAction(a.userId, 'approve')}
                            >
                              Approve
                            </button>
                            <button
                              className="reject-btn"
                              disabled={busy}
                              onClick={() => memberAction(a.userId, 'reject')}
                            >
                              Decline
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mini-stat">
                <span>Approved members</span>
                <b>
                  {admin?.members.filter(m => m.status === 'active').length ||
                    0}
                </b>
              </div>
            </div>}
            <div className="admin-card span-two">
              <div className="card-heading">
                <div className="card-icon">
                  <Clapperboard size={18} />
                </div>
                <div>
                  <h3>Published videos</h3>
                  <p>Remove a title from the member library at any time.</p>
                </div>
              </div>
              <div className="manage-videos">
                {videos.length === 0 ? (
                  <div className="empty-small">
                    Your video library is empty. Publish your first video above.
                  </div>
                ) : (
                  videos.map(v => (
                    <div className="manage-video" key={v.id}>
                      <div className="mini-thumb">
                        {v.thumbnailUrl ? (
                          <img src={v.thumbnailUrl} alt="Video cover" />
                        ) : (
                          <Play size={17} />
                        )}
                      </div>
                      <div className="manage-video-title">
                        {editingVideoId === v.id ? <div className="video-edit-fields"><input value={editVideoDraft.title} onChange={e => setEditVideoDraft({ ...editVideoDraft, title: e.target.value })} placeholder="Video title"/><input value={editVideoDraft.category} onChange={e => setEditVideoDraft({ ...editVideoDraft, category: e.target.value })} placeholder="Category"/><textarea rows={2} value={editVideoDraft.description} onChange={e => setEditVideoDraft({ ...editVideoDraft, description: e.target.value })} placeholder="Description"/><button className="primary-btn" disabled={busy} onClick={() => saveVideoEdit(v.id)}>Save changes</button><button className="secondary-btn" onClick={() => setEditingVideoId('')}>Cancel</button></div> : <><b>{v.title}</b><small>{v.category || 'Exclusive'}</small></>}
                      </div>
                      {editingVideoId !== v.id && <button className="secondary-btn" onClick={() => beginVideoEdit(v)}>Edit</button>}
                      <button
                        className="icon-btn danger"
                        onClick={() => deleteVideo(v.id)}
                        aria-label={'Delete ' + v.title}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </main>
      ) : (
        <main className="member-page">
          {!isMember ? (
            <section className="gate-hero">
              <div className="gate-backdrop" />
              <div className="gate-content">
                <div className="eyebrow">
                  <Crown size={14} /> THE MEMBERS ROOM
                </div>
                <h1>
                  Go beyond
                  <br />
                  <em>the ordinary.</em>
                </h1>
                <p>
                  Choose a time-based access pass when you open any exclusive video. Pay securely through Paystack and watch while your pass is active.
                </p>
                <div className="gate-actions">
                  <button className="primary-btn" onClick={user ? () => setErrorMessage('Choose any video below to view the available access plans.') : signIn}>
                    {user ? 'Browse video plans' : 'Sign in to continue'} <ArrowRight size={17} />
                  </button>
                  <span className="secure-caption">
                    <LockKeyhole size={14} /> Secure Paystack checkout · KSh pricing
                  </span>
                </div>
              </div>
              <div className="gate-art">
                <div className="gate-ring" />
                <div className="gate-play">
                  <Play size={34} fill="currentColor" />
                </div>
                <div className="gate-art-label">
                  EXCLUSIVE
                  <br />
                  CONTENT
                </div>
              </div>
            </section>
          ) : (
            <section className="welcome-banner">
              <div>
                <div className="eyebrow">
                  <BadgeCheck size={14} /> VERIFIED MEMBER ACCESS
                </div>
                <h1>
                  Your private <em>screening room.</em>
                </h1>
                <p>New releases, selected for members. Enjoy the show.</p>
              </div>
              <span className="member-chip">
                <Crown size={15} /> ACTIVE MEMBER
              </span>
            </section>
          )}
          {false && !isMember && (
            <section className="request-section">
              <div className="request-intro">
                <div className="eyebrow">STEP 02 / VERIFY YOUR MEMBERSHIP</div>
                <h2>
                  {applicationPending
                    ? 'Your request is in review.'
                    : applicationRejected
                      ? 'Request another review.'
                      : 'Already subscribed?'}
                </h2>
                <p>
                  {applicationPending
                    ? 'Your details have been submitted. The owner will verify your Facebook subscription and approve access.'
                    : 'Sign in with your member account and send your Facebook subscriber name. The owner will manually verify your subscription.'}
                </p>
              </div>
              <div className="request-form">
                <div className="form-field">
                  <label>YOUR NAME</label>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Name shown on your account"
                  />
                </div>
                <div className="form-field">
                  <label>FACEBOOK SUBSCRIBER NAME</label>
                  <input
                    value={facebookName}
                    onChange={e => setFacebookName(e.target.value)}
                    placeholder="Name shown on Facebook"
                  />
                </div>
                <button
                  className="primary-btn wide"
                  disabled={busy || (!!user && applicationPending)}
                  onClick={user ? apply : signIn}
                >
                  {!user ? 'Sign in to request access' : applicationPending ? 'Request submitted' : 'Request member access'}{' '}
                  <ArrowRight size={16} />
                </button>
                <small className="helper">
                  Approval is manual. Please make sure the Facebook name matches
                  the subscribing account.
                </small>
              </div>
            </section>
          )}
          <section className="library-section">
              <div className="library-heading">
                <div>
                  <div className="eyebrow">NOW SHOWING / EXCLUSIVE PREVIEWS</div>
                  <h2>
                    Browse the <em>library.</em>
                  </h2>
                </div>
                <span className="library-count">
                  {videos.length} {videos.length === 1 ? 'TITLE' : 'TITLES'}
                </span>
              </div>
              {videos.length === 0 ? (
                <div className="empty-library">
                  <div className="empty-icon">
                    <Film size={25} />
                  </div>
                  <h3>Your first premiere is on its way.</h3>
                  <p>
                    There are no videos published yet. Check back soon for
                    exclusive releases.
                  </p>
                </div>
              ) : (
                <>
                  {categories.map(category => (
                    <div className="category-block" key={category}>
                      <h3>{category}</h3>
                      <div className="video-grid">
                        {videos
                          .filter(v => (v.category || 'Exclusive') === category)
                          .map(v => (
                            <button
                              className="video-card"
                              key={v.id}
                              onClick={() => playVideo(v)}
                            >
                              <div className="video-thumb">
                                {v.thumbnailUrl ? (
                                  <img src={v.thumbnailUrl} alt="" />
                                ) : (
                                  <div className="thumb-placeholder">
                                    <Clapperboard size={28} />
                                    <span>FLIX EXCLUSIVE</span>
                                  </div>
                                )}
                                <span className="play-overlay">
                                  <Play size={19} fill="currentColor" />
                                </span>
                                <span className="exclusive-label">
                                  {isMember ? 'ACTIVE ACCESS' : 'CHOOSE A PLAN'}
                                </span>
                              </div>
                              <div className="video-card-copy">
                                <b>{v.title}</b>
                                <small>
                                  {v.description || 'Exclusive member release'}
                                </small>
                                <div className="video-stats"><span>▶ {(v.views || 0).toLocaleString()} views</span><span>♥ {(v.likes || 0).toLocaleString()}</span><span>▤ {(v.comments || 0).toLocaleString()}</span></div>
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </section>
          <footer className="site-footer">
            <div className="brand">
              <img className="flix-footer-logo" src="/resources/flix-logo.png" alt="Flix Exclusive Content" />
            </div>
            <span>PRIVATE CONTENT. APPROVED MEMBERS ONLY.</span>
          </footer>
        </main>
      )}
      {paymentNotice && <div className="toast-error" role="status"><span>{paymentNotice}</span><button onClick={() => setPaymentNotice('')}><X size={16}/></button></div>}
      {subscribeModal && (
        <div className="modal-backdrop" onClick={() => setSubscribeModal(false)}>
          <div className="subscribe-modal paywall-modal" onClick={e => e.stopPropagation()}>
            <button className="icon-btn close-subscribe" onClick={() => setSubscribeModal(false)} aria-label="Close"><X size={18}/></button>
            <div className="subscribe-crown"><Crown size={25}/></div>
            <div className="eyebrow">FLIX EXCLUSIVE / SECURE CHECKOUT</div>
            <h2>Unlock this <em>video.</em></h2>
            <p>{paywallVideo?.title || 'Choose your access pass'} · Select how long you want to watch.</p>
            <div className="plan-options">
              {publicPlans.map(plan => { const finalPrice = Math.max(1, Math.round(plan.amount * (1 - plan.discountPercent / 100))); return <button key={plan.id} className={'plan-option ' + (selectedPlanId === plan.id ? 'plan-selected' : '')} onClick={() => setSelectedPlanId(plan.id)}><span><b>{plan.name}</b><small>{plan.days} day{plan.days === 1 ? '' : 's'} access {plan.discountPercent > 0 ? '· ' + plan.discountPercent + '% OFF' : ''}</small></span><strong>{plan.discountPercent > 0 && <del>KSh {plan.amount.toLocaleString()} </del>}KSh {finalPrice.toLocaleString()}</strong></button>; })}
            </div>
            <button className="primary-btn wide" disabled={busy} onClick={startCheckout}>{busy ? 'Connecting to Paystack…' : 'Continue to Paystack'} <ArrowRight size={17}/></button>
            <small className="helper">Access activates only after Paystack payment is verified. Your pass expires automatically.</small>
          </div>
        </div>
      )}
      {selected && (
        <div className="video-modal-fullscreen" onClick={() => setSelected(null)}>
          <div className="video-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">FLIX EXCLUSIVE / NOW PLAYING</span>
                <h3>{selected.title}</h3>
              </div>
              <div className="player-actions"><button className="icon-btn" onClick={() => videoRef?.requestFullscreen?.()} aria-label="Fullscreen video">⛶</button><button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close player"><X size={19} /></button></div>
            </div>
            <div className="flix-player-frame">
              <video
                ref={setVideoRef}
                controls
                autoPlay
                src={selected.videoUrl}
                poster={selected.thumbnailUrl}
                controlsList="nodownload"
                onContextMenu={e => e.preventDefault()}
              >
                Your browser does not support this video.
              </video>
              <img className="flix-video-watermark" src="/resources/flix-logo.png" alt="Flix Exclusive Content watermark" />
            </div>
            <p>{selected.description}</p>
            <div className="player-stats"><span>▶ {(selected.views || 0).toLocaleString()} views</span><button onClick={toggleLike} className={liked ? 'liked' : ''}>♥ {(selected.likes || 0).toLocaleString()} {liked ? 'Liked' : 'Like'}</button><span>▤ {(selected.comments || 0).toLocaleString()} comments</span></div>
            <section className="comments-panel"><h4>Comments</h4><div className="comment-compose"><input value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Write a comment…" maxLength={500}/><button className="primary-btn" onClick={postComment} disabled={!commentText.trim()}>Post</button></div>{videoComments.map(c => <div className="comment-item" key={c.id}><b>{c.author || 'Member'}</b><p>{c.text}</p></div>)}{videoComments.length === 0 && <small className="helper">Be the first to comment.</small>}</section>
            <small className="helper">
              Playback availability depends on your video host and the
              browser/device.
            </small>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
