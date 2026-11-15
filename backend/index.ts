import {
  router,
  json,
  error,
  requireAuth,
  requireAdminEmailAllowlist,
  db,
  storage,
  increment,
  secrets,
} from '@appdeploy/sdk';

const ADMIN_EMAILS = ['felixombaba07@gmail.com'];
const adminOnly = requireAdminEmailAllowlist(ADMIN_EMAILS);

async function settings() {
  const [current] = await db.get<any>('flix_settings', ['global'], {
    consistent: true,
  });
  if (current) return current;
  await db.tx.add('flix_settings', [
    { id: 'global', facebookUrl: '', updatedAt: new Date().toISOString() },
  ]);
  const [created] = await db.get<any>('flix_settings', ['global'], {
    consistent: true,
  });
  return created || { facebookUrl: '' };
}

async function isActiveMember(userId: string) {
  const [member] = await db.get<any>('flix_members', [userId], {
    consistent: true,
  });
  return member?.status === 'active' ? member : null;
}

const ACCESS_PLANS: Record<string, { id: string; name: string; amount: number; days: number; discountPercent: number }> = {
  daily: { id: 'daily', name: 'Daily', amount: 49, days: 1, discountPercent: 0 },
  weekly: { id: 'weekly', name: 'Weekly', amount: 199, days: 7, discountPercent: 0 },
  fortnight: { id: 'fortnight', name: '14 days', amount: 299, days: 14, discountPercent: 0 },
  monthly: { id: 'monthly', name: '30 days', amount: 599, days: 30, discountPercent: 0 },
  quarterly: { id: 'quarterly', name: '90 days', amount: 1299, days: 90, discountPercent: 0 },
};

async function currentPlans() {
  const config = await settings();
  const saved = Array.isArray(config.plans) ? config.plans : [];
  return Object.values(ACCESS_PLANS).map(base => {
    const stored = saved.find((item: any) => item.id === base.id) || base;
    const amount = Number(stored.amount);
    const discountPercent = Number(stored.discountPercent || 0);
    return { ...base, amount: Number.isInteger(amount) && amount >= 1 && amount <= 1000000 ? amount : base.amount, discountPercent: Number.isInteger(discountPercent) ? Math.min(90, Math.max(0, discountPercent)) : 0 };
  });
}

function payableAmount(plan: { amount: number; discountPercent: number }) {
  return Math.max(1, Math.round(plan.amount * (1 - plan.discountPercent / 100)));
}

async function paidAccess(userId: string) {
  const [access] = await db.get<any>('flix_paid_access', [userId], { consistent: true });
  const activeUntil = access?.activeUntil ? new Date(access.activeUntil).getTime() : 0;
  return activeUntil > Date.now() ? access : null;
}

async function requirePaidOrAdmin(ctx: any) {
  const admin = (ctx.user?.email || '').toLowerCase() === ADMIN_EMAILS[0];
  return admin || !!(await paidAccess(ctx.user!.userId));
}

async function listVideos() {
  const result = await db.list<any>('flix_videos', { limit: 100 });
  const sorted = result.items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return Promise.all(sorted.map(async video => {
    if (!video.coverPath) return video;
    const [cover] = await storage.url([video.coverPath]);
    return { ...video, thumbnailUrl: cover?.url || '' };
  }));
}

export const handler = router({
  'POST /api/payments/initialize': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as { planId?: string; videoId?: string };
      const plan = (await currentPlans()).find(item => item.id === String(body.planId || ''));
      const email = String(ctx.user!.email || '').trim();
      if (!plan) return error('Choose a valid access plan.', 400);
      const chargeAmount = payableAmount(plan);
      if (!email) return error('Your account needs an email address for Paystack checkout.', 400);
      try {
        const secretKey = await secrets.readSecret('PAYSTACK_SECRET_KEY');
        const reference = 'flix-' + Date.now() + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const callbackUrl = 'https://flix-exclusive-content-l6x6qi.v2.appdeploy.ai/?payment=success&reference=' + encodeURIComponent(reference) + '&videoId=' + encodeURIComponent(String(body.videoId || ''));
        const pending = {
          userId: ctx.user!.userId,
          email,
          planId: String(body.planId),
          videoId: String(body.videoId || ''),
          amount: chargeAmount * 100,
          baseAmount: plan.amount,
          discountPercent: plan.discountPercent,
          planName: plan.name,
          planDays: plan.days,
          currency: 'KES',
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        const [saved] = await db.tx.add('flix_payments', [{ id: reference, ...pending }]);
        if (!saved) return error('Could not create your payment. Please try again.', 500);
        const response = await fetch('https://api.paystack.co/transaction/initialize', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + secretKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            amount: String(chargeAmount * 100),
            currency: 'KES',
            reference,
            callback_url: callbackUrl,
            metadata: { userId: ctx.user!.userId, planId: String(body.planId), videoId: String(body.videoId || '') },
          }),
        });
        const result = await response.json() as any;
        if (!response.ok || !result?.status || !result?.data?.authorization_url) {
          await db.tx.update('flix_payments', [{ id: reference, record: { ...pending, status: 'initialization_failed' } }], { patch: false });
          return error('Paystack could not start checkout. Please try again.', 502);
        }
        return json({ authorizationUrl: result.data.authorization_url, reference });
      } catch {
        return error('Payment setup is unavailable. Please try again later.', 500);
      }
    },
  ],

  'POST /api/payments/verify': [
    requireAuth(),
    async ctx => {
      const reference = String((ctx.body as { reference?: string } | null)?.reference || '').trim();
      if (!reference || !/^[a-zA-Z0-9.=\-_]+$/.test(reference)) return error('A valid payment reference is required.', 400);
      try {
        const [payment] = await db.get<any>('flix_payments', [reference], { consistent: true });
        if (!payment || payment.userId !== ctx.user!.userId) return error('Payment reference not found for this account.', 404);
        if (payment.status === 'verified') {
          const existingAccess = await paidAccess(ctx.user!.userId);
          return json({ verified: true, access: existingAccess });
        }
        const secretKey = await secrets.readSecret('PAYSTACK_SECRET_KEY');
        const response = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(reference), {
          headers: { Authorization: 'Bearer ' + secretKey },
        });
        const result = await response.json() as any;
        const transaction = result?.data;
        if (!response.ok || !result?.status || transaction?.status !== 'success') return error('Payment is not confirmed yet. If you completed checkout, try verifying again shortly.', 402);
        if (transaction.reference !== reference || transaction.currency !== 'KES' || Number(transaction.amount) !== Number(payment.amount)) return error('Payment details did not match the selected plan. Access was not granted.', 400);
        const basePlan = ACCESS_PLANS[payment.planId];
        const plan = basePlan ? { name: String(payment.planName || basePlan.name), days: Number(payment.planDays || basePlan.days) } : null;
        if (!plan || !Number.isFinite(plan.days) || plan.days < 1 || plan.days > 365) return error('The purchased plan is invalid. Please contact support.', 400);
        const now = Date.now();
        const [current] = await db.get<any>('flix_paid_access', [ctx.user!.userId], { consistent: true });
        const currentEnd = current?.activeUntil ? new Date(current.activeUntil).getTime() : 0;
        const startAt = Math.max(now, currentEnd);
        const activeUntil = new Date(startAt + plan.days * 24 * 60 * 60 * 1000).toISOString();
        const accessRecord = {
          userId: ctx.user!.userId,
          status: 'active',
          planId: payment.planId,
          planName: plan.name,
          activeFrom: new Date(now).toISOString(),
          activeUntil,
          updatedAt: new Date().toISOString(),
        };
        if (current) await db.tx.update('flix_paid_access', [{ id: ctx.user!.userId, record: accessRecord }], { patch: false });
        else await db.tx.add('flix_paid_access', [{ id: ctx.user!.userId, ...accessRecord }]);
        await db.tx.update('flix_payments', [{ id: reference, record: { ...payment, status: 'verified', verifiedAt: new Date().toISOString(), paystackTransactionId: String(transaction.id || '') } }], { patch: false });
        return json({ verified: true, access: accessRecord, videoId: payment.videoId });
      } catch {
        return error('Unable to verify payment right now. Please try again.', 500);
      }
    },
  ],

  'GET /api/public/config': [
    async () => {
      try {
        const config = await settings();
        return json({
          brand: 'Flix Exclusive Content',
          facebookUrl: config.facebookUrl || '',
          plans: await currentPlans(),
        });
      } catch {
        return error('Unable to load membership settings.', 500);
      }
    },
  ],

  'GET /api/public/videos': [
    async () => {
      try {
        const videos = await listVideos();
        return json({ videos: videos.map(v => ({ id: v.id, title: v.title, description: v.description || '', category: v.category || 'Exclusive', thumbnailUrl: v.thumbnailUrl || '', views: v.views || 0, likes: v.likes || 0, comments: v.comments || 0, createdAt: v.createdAt || '' })) });
      } catch {
        return error('Unable to load the video catalogue.', 500);
      }
    },
  ],

  'POST /api/member/videos/:id/view': [
    requireAuth(),
    async ctx => {
      try {
        const admin = (ctx.user!.email || '').toLowerCase() === ADMIN_EMAILS[0];
        if (!admin && !(await paidAccess(ctx.user!.userId))) return error('An active paid plan is required.', 403);
        const [updated] = await db.tx.update('flix_videos', [{ id: ctx.params.id, record: { views: increment(1) } }], { patch: true });
        if (!updated) return error('Video not found.', 404);
        return json({ recorded: true });
      } catch { return error('Unable to record this view.', 500); }
    },
  ],

  'POST /api/member/videos/:id/like': [
    requireAuth(),
    async ctx => {
      try {
        const admin = (ctx.user!.email || '').toLowerCase() === ADMIN_EMAILS[0];
        if (!admin && !(await paidAccess(ctx.user!.userId))) return error('An active paid plan is required.', 403);
        const videoId = ctx.params.id;
        const likeId = videoId + '_' + ctx.user!.userId;
        const [existing] = await db.get<any>('flix_video_likes', [likeId], { consistent: true });
        if (existing) {
          await db.delete('flix_video_likes', [likeId]);
          const [updated] = await db.tx.update('flix_videos', [{ id: videoId, record: { likes: increment(-1) } }], { patch: true });
          if (!updated) return error('Video not found.', 404);
          return json({ liked: false });
        }
        const [id] = await db.tx.add('flix_video_likes', [{ id: likeId, videoId, userId: ctx.user!.userId, createdAt: new Date().toISOString() }]);
        if (!id) return error('Could not save your like. Please try again.', 409);
        const [updated] = await db.tx.update('flix_videos', [{ id: videoId, record: { likes: increment(1) } }], { patch: true });
        if (!updated) return error('Video not found.', 404);
        return json({ liked: true });
      } catch { return error('Unable to update your like.', 500); }
    },
  ],

  'GET /api/member/videos/:id/comments': [
    requireAuth(),
    async ctx => {
      try {
        const admin = (ctx.user!.email || '').toLowerCase() === ADMIN_EMAILS[0];
        if (!admin && !(await paidAccess(ctx.user!.userId))) return error('An active paid plan is required.', 403);
        const result = await db.list<any>('flix_video_comments', { limit: 100 });
        const comments = result.items.filter(c => c.videoId === ctx.params.id).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
        const likeId = ctx.params.id + '_' + ctx.user!.userId;
        const [like] = await db.get<any>('flix_video_likes', [likeId], { consistent: true });
        return json({ comments, liked: !!like });
      } catch { return error('Unable to load comments.', 500); }
    },
  ],

  'POST /api/member/videos/:id/comments': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as { text?: string };
      const comment = String(body.text || '').trim().slice(0, 500);
      if (!comment) return error('Write a comment first.', 400);
      try {
        const admin = (ctx.user!.email || '').toLowerCase() === ADMIN_EMAILS[0];
        if (!admin && !(await paidAccess(ctx.user!.userId))) return error('An active paid plan is required.', 403);
        const [id] = await db.add('flix_video_comments', [{ videoId: ctx.params.id, userId: ctx.user!.userId, author: ctx.user!.name || 'Member', text: comment, createdAt: new Date().toISOString() }]);
        if (!id) return error('Could not post your comment.', 500);
        const [updated] = await db.tx.update('flix_videos', [{ id: ctx.params.id, record: { comments: increment(1) } }], { patch: true });
        if (!updated) return error('Video not found.', 404);
        return json({ id, posted: true });
      } catch { return error('Unable to post your comment.', 500); }
    },
  ],

  'GET /api/member/videos/:id': [
    requireAuth(),
    async ctx => {
      try {
        const admin = (ctx.user!.email || '').toLowerCase() === ADMIN_EMAILS[0];
        if (!admin && !(await paidAccess(ctx.user!.userId))) return error('An active paid plan is required.', 403);
        const [video] = await db.get<any>('flix_videos', [ctx.params.id], { consistent: true });
        if (!video) return error('Video not found.', 404);
        let videoUrl = video.videoUrl || '';
        if (video.storagePath) {
          const [signed] = await storage.url([video.storagePath]);
          videoUrl = signed?.url || '';
        }
        if (!videoUrl) return error('Video file is unavailable.', 404);
        return json({ videoUrl });
      } catch {
        return error('Unable to open this video.', 500);
      }
    },
  ],

  'GET /api/me': [
    requireAuth(),
    async ctx => {
      try {
        const userId = ctx.user!.userId;
        const [member] = await db.get<any>('flix_members', [userId], {
          consistent: true,
        });
        const [application] = await db.get<any>('flix_applications', [userId], {
          consistent: true,
        });
        const config = await settings();
        const isAdmin =
          (ctx.user!.email || '').toLowerCase() === ADMIN_EMAILS[0];
        return json({
          user: { userId, email: ctx.user!.email, name: ctx.user!.name },
          isAdmin,
          membership: member || null,
          application: application || null,
          paidAccess: isAdmin ? { active: true, planName: 'Owner access', activeUntil: null } : (await paidAccess(userId) ? { ...await paidAccess(userId), active: true } : { active: false }),
          facebookUrl: config.facebookUrl || '',
        });
      } catch {
        return error('Unable to load your membership status.', 500);
      }
    },
  ],

  'POST /api/applications': [
    requireAuth(),
    async ctx => {
      const body = (ctx.body || {}) as { name?: string; facebookName?: string };
      const name = String(body.name || '')
        .trim()
        .slice(0, 100);
      const facebookName = String(body.facebookName || '')
        .trim()
        .slice(0, 100);
      if (!name || !facebookName)
        return error(
          'Your name and Facebook subscriber name are required.',
          400
        );
      try {
        const userId = ctx.user!.userId;
        if (await isActiveMember(userId))
          return error('Your membership is already active.', 409);
        const [existing] = await db.get<any>('flix_applications', [userId], {
          consistent: true,
        });
        const record = {
          userId,
          name,
          facebookName,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        if (existing) {
          const [updated] = await db.tx.update(
            'flix_applications',
            [{ id: userId, record }],
            { patch: false }
          );
          if (!updated)
            return error(
              'Could not update your request. Please try again.',
              500
            );
        } else {
          const [id] = await db.tx.add('flix_applications', [
            { id: userId, ...record },
          ]);
          if (!id)
            return error(
              'A request already exists or could not be created.',
              409
            );
        }
        return json({ submitted: true, status: 'pending' });
      } catch {
        return error('Unable to submit your request. Please try again.', 500);
      }
    },
  ],

  'GET /api/library': [
    requireAuth(),
    async ctx => {
      try {
        const admin = (ctx.user!.email || '').toLowerCase() === ADMIN_EMAILS[0];
        return json({ videos: await listVideos() });
      } catch {
        return error('Unable to load the video library.', 500);
      }
    },
  ],

  'GET /api/admin/overview': [
    requireAuth(),
    adminOnly,
    async () => {
      try {
        const config = await settings();
        const [videos, applications, members] = await Promise.all([
          listVideos(),
          db.list<any>('flix_applications', { limit: 100 }),
          db.list<any>('flix_members', { limit: 100 }),
        ]);
        return json({
          facebookUrl: config.facebookUrl || '',
          videos,
          applications: applications.items.sort((a, b) =>
            String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
          ),
          members: members.items,
        });
      } catch {
        return error('Unable to load admin data.', 500);
      }
    },
  ],

  'PUT /api/admin/settings': [
    requireAuth(),
    adminOnly,
    async ctx => {
      const body = (ctx.body || {}) as { facebookUrl?: string };
      const facebookUrl = String(body.facebookUrl || '').trim();
      if (facebookUrl && !/^https:\/\//i.test(facebookUrl))
        return error(
          'Facebook subscription link must start with https://',
          400
        );
      try {
        await db.tx.update(
          'flix_settings',
          [
            {
              id: 'global',
              record: { facebookUrl, updatedAt: new Date().toISOString() },
            },
          ],
          { patch: true }
        );
        return json({ saved: true });
      } catch {
        return error('Unable to save the Facebook link.', 500);
      }
    },
  ],

  'POST /api/admin/videos': [
    requireAuth(),
    adminOnly,
    async ctx => {
      const body = (ctx.body || {}) as {
        title?: string;
        description?: string;
        category?: string;
        videoUrl?: string;
        thumbnailUrl?: string;
      };
      const title = String(body.title || '')
        .trim()
        .slice(0, 140);
      const videoUrl = String(body.videoUrl || '').trim();
      const thumbnailUrl = String(body.thumbnailUrl || '').trim();
      if (!title || !/^https:\/\//i.test(videoUrl))
        return error('Enter a title and an HTTPS video URL.', 400);
      if (thumbnailUrl && !/^https:\/\//i.test(thumbnailUrl))
        return error('Thumbnail URL must use HTTPS.', 400);
      try {
        const [id] = await db.add('flix_videos', [
          {
            title,
            description: String(body.description || '')
              .trim()
              .slice(0, 500),
            category:
              String(body.category || 'Exclusive')
                .trim()
                .slice(0, 60) || 'Exclusive',
            videoUrl,
            thumbnailUrl,
            createdAt: new Date().toISOString(),
          },
        ]);
        if (!id) return error('Could not publish this video.', 500);
        return json({ id, published: true });
      } catch {
        return error('Unable to publish this video.', 500);
      }
    },
  ],

  'POST /api/admin/videos/upload': [
    requireAuth(),
    adminOnly,
    async ctx => {
      const body = (ctx.body || {}) as { title?: string; description?: string; category?: string; coverBase64?: string; coverFileName?: string; coverContentType?: string; fileName?: string; contentType?: string; base64Data?: string };
      const title = String(body.title || '').trim().slice(0, 140);
      const contentType = String(body.contentType || '');
      const base64Data = String(body.base64Data || '');
      const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
      if (!title || !allowedTypes.includes(contentType) || !base64Data) return error('Enter a title and choose an MP4, WebM or MOV video.', 400);
      if (base64Data.length > 5_600_000) return error('Video file is too large. The direct uploader limit is 4 MB.', 413);
      const coverBase64 = String(body.coverBase64 || '');
      const coverContentType = String(body.coverContentType || '');
      if (coverBase64 && (!['image/jpeg', 'image/png', 'image/webp'].includes(coverContentType) || coverBase64.length > 5_600_000)) return error('Cover must be a JPG, PNG or WebP image up to 4 MB.', 400);
      try {
        const safeName = String(body.fileName || 'video').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90);
        const path = 'videos/' + Date.now() + '-' + safeName;
        const [stored] = await storage.write([{ path, content: base64Data, contentType }]);
        if (!stored) return error('Video upload failed. Please try again.', 500);
        let coverPath = '';
        if (coverBase64) {
          const coverName = String(body.coverFileName || 'cover').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
          coverPath = 'covers/' + Date.now() + '-' + coverName;
          const [coverStored] = await storage.write([{ path: coverPath, content: coverBase64, contentType: coverContentType }]);
          if (!coverStored) { await storage.delete([path]); return error('Cover photo upload failed. Please try again.', 500); }
        }
        const [id] = await db.add('flix_videos', [{ title, description: String(body.description || '').trim().slice(0, 500), category: String(body.category || 'Exclusive').trim().slice(0, 60) || 'Exclusive', storagePath: path, contentType, coverPath, views: 0, likes: 0, comments: 0, createdAt: new Date().toISOString() }]);
        if (!id) {
          await storage.delete([path]);
          if (coverPath) await storage.delete([coverPath]);
          return error('Video was uploaded but could not be published. Please try again.', 500);
        }
        return json({ id, published: true });
      } catch {
        return error('Unable to upload this video. Please try again.', 500);
      }
    },
  ],

  'PUT /api/admin/plans': [
    requireAuth(),
    adminOnly,
    async ctx => {
      const body = (ctx.body || {}) as { plans?: Array<{ id?: string; amount?: number; discountPercent?: number }> };
      if (!Array.isArray(body.plans) || body.plans.length !== Object.keys(ACCESS_PLANS).length) return error('Submit all five access plans.', 400);
      const plans = [];
      for (const base of Object.values(ACCESS_PLANS)) {
        const submitted = body.plans.find(item => item.id === base.id);
        const amount = Number(submitted?.amount);
        const discountPercent = Number(submitted?.discountPercent);
        if (!submitted || !Number.isInteger(amount) || amount < 1 || amount > 1000000 || !Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 90) return error('Each plan needs a valid price and a discount from 0% to 90%.', 400);
        plans.push({ id: base.id, name: base.name, amount, days: base.days, discountPercent });
      }
      try {
        const [saved] = await db.tx.update('flix_settings', [{ id: 'global', record: { plans, updatedAt: new Date().toISOString() } }], { patch: true });
        if (!saved) return error('Could not save plan prices.', 500);
        return json({ saved: true, plans });
      } catch { return error('Unable to save plan prices.', 500); }
    },
  ],

  'PUT /api/admin/videos/:id': [
    requireAuth(),
    adminOnly,
    async ctx => {
      const body = (ctx.body || {}) as { title?: string; description?: string; category?: string };
      const title = String(body.title || '').trim().slice(0, 140);
      const description = String(body.description || '').trim().slice(0, 500);
      const category = String(body.category || '').trim().slice(0, 60);
      if (!title || !category) return error('Video title and category are required.', 400);
      try {
        const [updated] = await db.tx.update('flix_videos', [{ id: ctx.params.id, record: { title, description, category, updatedAt: new Date().toISOString() } }], { patch: true });
        return updated ? json({ updated: true }) : error('Video not found.', 404);
      } catch { return error('Unable to update this video.', 500); }
    },
  ],

  'GET /api/member/favorites': [
    requireAuth(),
    async ctx => {
      try {
        const result = await db.list<any>('flix_favorites', { limit: 200 });
        const favorites = result.items.filter(item => item.userId === ctx.user!.userId);
        const videos = await listVideos();
        return json({ videoIds: favorites.map(item => item.videoId), videos: videos.filter(video => favorites.some(item => item.videoId === video.id)) });
      } catch { return error('Unable to load your watchlist.', 500); }
    },
  ],

  'PUT /api/member/favorites/:id': [
    requireAuth(),
    async ctx => {
      const videoId = ctx.params.id;
      const favoriteId = ctx.user!.userId + '_' + videoId;
      try {
        const [existing] = await db.get<any>('flix_favorites', [favoriteId], { consistent: true });
        if (existing) {
          await db.delete('flix_favorites', [favoriteId]);
          return json({ favorited: false });
        }
        const [video] = await db.get<any>('flix_videos', [videoId], { consistent: true });
        if (!video) return error('Video not found.', 404);
        const [created] = await db.tx.add('flix_favorites', [{ id: favoriteId, userId: ctx.user!.userId, videoId, createdAt: new Date().toISOString() }]);
        return created ? json({ favorited: true }) : error('Could not add this video to your watchlist.', 409);
      } catch { return error('Unable to update your watchlist.', 500); }
    },
  ],

  'DELETE /api/admin/videos/:id': [
    requireAuth(),
    adminOnly,
    async ctx => {
      try {
        const [existing] = await db.get<any>('flix_videos', [ctx.params.id], { consistent: true });
        if (existing?.storagePath) await storage.delete([existing.storagePath]);
        if (existing?.coverPath) await storage.delete([existing.coverPath]);
        const [deleted] = await db.delete('flix_videos', [ctx.params.id]);
        return deleted
          ? json({ deleted: true })
          : error('Video not found.', 404);
      } catch {
        return error('Unable to remove this video.', 500);
      }
    },
  ],

  'POST /api/admin/members/:userId': [
    requireAuth(),
    adminOnly,
    async ctx => {
      const body = (ctx.body || {}) as { action?: string };
      const action = body.action;
      const userId = ctx.params.userId;
      if (!['approve', 'reject', 'revoke'].includes(String(action)))
        return error('Invalid membership action.', 400);
      try {
        const [application] = await db.get<any>('flix_applications', [userId], {
          consistent: true,
        });
        if (!application && action !== 'revoke')
          return error('Membership request not found.', 404);
        if (action === 'approve') {
          const [existing] = await db.get<any>('flix_members', [userId], {
            consistent: true,
          });
          const member = {
            userId,
            name: application.name,
            facebookName: application.facebookName,
            status: 'active',
            approvedAt: new Date().toISOString(),
          };
          if (existing)
            await db.tx.update(
              'flix_members',
              [{ id: userId, record: member }],
              { patch: false }
            );
          else await db.tx.add('flix_members', [{ id: userId, ...member }]);
          await db.tx.update(
            'flix_applications',
            [{ id: userId, record: { ...application, status: 'approved' } }],
            { patch: false }
          );
        } else if (action === 'reject') {
          await db.tx.update(
            'flix_applications',
            [{ id: userId, record: { ...application, status: 'rejected' } }],
            { patch: false }
          );
        } else {
          await db.tx.update(
            'flix_members',
            [
              {
                id: userId,
                record: {
                  userId,
                  status: 'revoked',
                  revokedAt: new Date().toISOString(),
                },
              },
            ],
            { patch: false }
          );
        }
        return json({ updated: true, action });
      } catch {
        return error('Unable to update membership.', 500);
      }
    },
  ],
});
