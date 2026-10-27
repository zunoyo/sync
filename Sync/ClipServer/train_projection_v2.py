# -*- coding: utf-8 -*-
"""
8감정 이미지 재학습 (romantic·melancholy 포함) — EmoSet(6감정) + 직접 라벨링한 실사용 이미지(8감정).

[왜]
지금 프로젝션은 EmoSet 6감정만 학습해서 romantic/melancholy 이미지는 한 장도 못 맞힌다(재현율 0).
이 스크립트는 EmoSet 임베딩(캐시 재사용)에 실사용 이미지 임베딩을 섞어 8감정 앵커로 다시 학습한다.
  - 실사용 이미지는 장수가 적어(수백 장) EmoSet 에 묻히므로 --real-weight 배로 가중한다.
  - 실사용 이미지만으로 K-겹 교차검증(OOF)을 돌려 '학습에 안 쓴 이미지'에서의 정확도를 잰다 → 가중치 선택과
    온도(T) 보정은 이 OOF 로만 한다. 평가용 이미지(--eval-dir)는 선택에 쓰지 않고 마지막에 한 번 보고만 한다.
  - 기존 체크포인트(--base)의 다른 값(텍스트 보정, 텍스트 T 등)은 그대로 가져가고, 프로젝션/VA헤드/이미지 T 만 바꾼다.
  - 결과는 새 파일(--out, 기본 model/emotion_projection_v2.pt)로 저장 — 기존 파일은 건드리지 않는다.

사용
  python train_projection_v2.py --real-dir data/train_images --eval-dir data/real_images_ai
  # 가중치 후보를 훑어서 OOF 가 가장 좋은 값으로 최종 학습:
  python train_projection_v2.py --real-dir data/train_images --real-weight 10,30,60 --eval-dir data/real_images_ai
좋으면: model/emotion_projection.pt 를 백업한 뒤 v2 를 emotion_projection.pt 이름으로 복사하고 서버 재시작.
        (그 뒤 python eval_fusion.py --grid --cv --w 0.1 --save-temperature 로 복합 온도도 다시 맞춘다)
"""
import argparse
import hashlib
import os

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_HN_PAIRS = "happy:energetic,energetic:happy,calm:dreamy,dreamy:calm"
IMG_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


# ───────────────── 순수 함수(특징 벡터 수준 — CLIP 없이 테스트 가능) ─────────────────
def parse_pairs(spec, names):
    out = []
    for item in [x.strip() for x in (spec or "").split(",") if x.strip()]:
        a, b = [t.strip() for t in item.split(":")]
        if a in names and b in names:
            out.append((names.index(a), names.index(b)))
    return out


def train_projection(feats, y, va_t, sample_w, anchors, va_anchor_t=None, *, epochs=10, lr=1e-3, weight_decay=1e-4,
                     batch_size=64, tau=0.07, hn_pairs=(), hn_margin=0.1, hn_weight=1.0, va_weight=1.0, seed=0, device="cpu",
                     smooth_eps=0.0, partner=None):
    """feats[N,512](L2 정규화), y[N](서비스 감정 인덱스), va_t[N,2], sample_w[N]. → (projection, va_head)"""
    from model.emotion_classifier import EmotionProjection, VAHead
    g = torch.Generator().manual_seed(seed)
    torch.manual_seed(seed)
    proj, vah = EmotionProjection(dim=feats.shape[1]).to(device), VAHead(dim=feats.shape[1]).to(device)
    opt = torch.optim.Adam(list(proj.parameters()) + list(vah.parameters()), lr=lr, weight_decay=weight_decay)
    anchors = anchors.to(device)
    ds = torch.utils.data.TensorDataset(feats, y, va_t, sample_w)
    for _ in range(epochs):
        proj.train(); vah.train()
        for xb, yb, vb, wb in torch.utils.data.DataLoader(ds, batch_size=batch_size, shuffle=True, generator=g):
            xb, yb, vb, wb = xb.to(device), yb.to(device), vb.to(device), wb.to(device)
            corr = proj(xb)
            cos = corr @ anchors.T
            ce_each = F.cross_entropy(cos / tau, yb, reduction="none")
            if smooth_eps > 0 and partner is not None:       # 헷갈리는 짝(예: calm↔dreamy)에 정답 확률의 일부를 나눠 준다
                pt = partner.to(yb.device)[yb]
                pt = torch.where(pt >= 0, pt, yb)
                ce_each = (1 - smooth_eps) * ce_each + smooth_eps * F.cross_entropy(cos / tau, pt, reduction="none")
            ce = (ce_each * wb).sum() / wb.sum()
            mse = F.mse_loss(vah(corr), vb)
            hn = torch.zeros((), device=device)
            terms = []
            for p, n in hn_pairs:
                m = yb == p
                if m.any():
                    terms.append((torch.relu(hn_margin - (cos[m, p] - cos[m, n])) * wb[m]).sum() / wb[m].sum())
            if terms:
                hn = torch.stack(terms).mean()
            loss = ce + va_weight * mse + hn_weight * hn
            opt.zero_grad(); loss.backward(); opt.step()
    proj.eval(); vah.eval()
    return proj, vah


@torch.no_grad()
def cos_logits(proj, feats, anchors, device="cpu"):
    return (proj(feats.to(device)) @ anchors.to(device).T).cpu().numpy()


def softmax_np(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def ece_np(p, y, bins=10):
    conf, hit = p.max(1), (p.argmax(1) == y).astype(float)
    edges, tot = np.linspace(0, 1, bins + 1), 0.0
    for i in range(bins):
        m = (conf > edges[i]) & (conf <= edges[i + 1]) if i else (conf >= 0) & (conf <= edges[1])
        if m.any():
            tot += m.mean() * abs(hit[m].mean() - conf[m].mean())
    return float(tot)


def fit_T(parts):
    """parts = [(cos_logits, y, weight), ...] — 가중 NLL 을 최소로 하는 T(그리드)."""
    best, bt = 1e9, 0.05
    for T in np.exp(np.linspace(np.log(0.01), np.log(0.3), 120)):
        nll = 0.0
        for z, y, w in parts:
            p = softmax_np(z / T)
            nll += w * float(-np.log(np.clip(p[np.arange(len(y)), y], 1e-9, 1)).mean())
        if nll < best:
            best, bt = nll, float(T)
    return bt


def stratified_folds(y, k, seed=0):
    rng = np.random.default_rng(seed)
    fold = np.zeros(len(y), dtype=int)
    for c in np.unique(y):
        idx = np.where(y == c)[0]
        rng.shuffle(idx)
        for j, i in enumerate(idx):
            fold[i] = j % k
    return fold


def oof_logits(emo, real, anchors, real_w, k, kw, bal=None, emo_w=None):
    """실사용 이미지를 K겹으로 나눠, 각 겹을 '학습에 안 쓴' 상태로 예측한 cos logits. emo/real = (feats,y,va)."""
    rf, ry, rv = real
    fold = stratified_folds(ry.numpy(), k)
    out = np.zeros((len(ry), anchors.shape[0]), dtype=np.float32)
    for f in range(k):
        tr, te = fold != f, fold == f
        F_ = torch.cat([emo[0], rf[tr]]); Y_ = torch.cat([emo[1], ry[tr]]); V_ = torch.cat([emo[2], rv[tr]])
        rw = torch.full((int(tr.sum()),), float(real_w))
        if bal is not None:
            rw = rw * bal[tr]
        W_ = torch.cat([emo_w if emo_w is not None else torch.ones(len(emo[1])), rw])
        proj, _ = train_projection(F_, Y_, V_, W_, anchors, **kw)
        out[te] = cos_logits(proj, rf[te], anchors)
    return out


LANDSCAPE_PROMPT = "a calm natural landscape photo of mountains, a lake, a forest or a sunset"
FANTASY_PROMPT = "a surreal dreamlike fantasy image with floating objects, space, clouds and pastel colors"


def landscape_mask(feats, text_feats, y, dreamy_idx, margin=0.0):
    """EmoSet 의 dreamy(=awe) 샘플 중 '현실 풍경'에 더 가까운 것(풍경 prompt 유사도 > 환상 prompt 유사도 + margin) 표시.
    feats[N,512](L2 정규화), text_feats[2,512] = [풍경, 환상]. 반환: bool[N]"""
    sims = feats.float() @ text_feats.float().T
    return (y == dreamy_idx) & (sims[:, 0] > sims[:, 1] + margin)


def macro_f1(pred, y, K):
    f = []
    for k in range(K):
        tp = int(((pred == k) & (y == k)).sum()); fp = int(((pred == k) & (y != k)).sum()); fn = int(((pred != k) & (y == k)).sum())
        if tp + fp + fn:
            f.append(2 * tp / (2 * tp + fp + fn))
    return float(np.mean(f)) if f else 0.0


def fit_class_bias(logits, y, K, lo=-1.0, hi=2.0, step=0.1, sweeps=3, lam=0.002):
    """학습에 안 쓴 이미지(OOF)의 logits(온도 적용 후)에 감정별 가산값 b[K] 를 더해 macro-F1 을 최대로 만든다.
    정밀도는 높은데 재현율이 낮은 감정(romantic·melancholy)의 '예측하기 꺼리는 정도'를 바로잡는 용도.
    좌표 상승(한 감정씩 격자 탐색), 크기 벌점 lam*b² 로 과하게 키우지 않는다. 반환: (b, f1_전, f1_후)"""
    b = np.zeros(K)
    f0 = macro_f1(logits.argmax(1), y, K)
    grid = np.arange(lo, hi + 1e-9, step)
    for _ in range(sweeps):
        for k in range(K):
            best, best_v = b[k], -1.0
            for g in grid:
                bb = b.copy(); bb[k] = g
                v = macro_f1((logits + bb).argmax(1), y, K) - lam * float((bb ** 2).sum())
                if v > best_v + 1e-12 or (abs(v - best_v) <= 1e-12 and abs(g) < abs(best)):
                    best, best_v = g, v
            b[k] = best
    b = b - b.mean()          # softmax 에서 전체에 같은 값을 더하는 건 무의미 → 평균 0 으로 정리
    return b, f0, macro_f1((logits + b).argmax(1), y, K)


def emoset_class_weights(y, names, spec):
    """EmoSet 샘플 가중. spec='dreamy=0.4,happy=0.8' 처럼 감정별 배율(기본 1). 없으면 None."""
    items = [x.strip() for x in str(spec or "").split(",") if x.strip()]
    if not items:
        return None
    w = torch.ones(len(y))
    for it in items:
        name, val = [t.strip() for t in it.split("=")]
        if name not in names:
            raise SystemExit(f"--emoset-class-weight: 모르는 감정 '{name}' (가능: {names})")
        w[y == names.index(name)] = float(val)
    return w


def balance_factors(y, K):
    """실사용 이미지 감정별 장수가 달라도 각 감정의 총 가중이 같아지게 하는 배율(평균 1)."""
    n = len(y)
    cnt = np.bincount(y.numpy(), minlength=K).astype(float)
    f = np.where(cnt > 0, n / (K_eff(cnt) * np.maximum(cnt, 1)), 0.0)
    return torch.tensor(f[y.numpy()], dtype=torch.float32)


def K_eff(cnt):
    return float((cnt > 0).sum())


def recall_table(pred, y, names):
    r = {}
    for i, n in enumerate(names):
        m = y == i
        if m.any():
            r[n] = (int((pred[m] == i).sum()), int(m.sum()))
    return r


# ───────────────── CLIP/데이터 쪽 ─────────────────
def real_features(root, names, clip_model, preprocess, device, clip_name="ViT-B/32"):
    """폴더(감정명)별 이미지 → CLIP 임베딩(캐시: 파일 목록/크기가 같으면 재사용)."""
    from PIL import Image
    files, ys = [], []
    for emo in sorted(os.listdir(root)):
        d = os.path.join(root, emo)
        if os.path.isdir(d) and emo in names:
            for f in sorted(os.listdir(d)):
                if f.lower().endswith(IMG_EXTS):
                    files.append(os.path.join(d, f)); ys.append(names.index(emo))
    key = hashlib.md5("|".join(f"{os.path.relpath(f, root)}:{os.path.getsize(f)}" for f in files).encode()).hexdigest()[:12]
    if clip_name != "ViT-B/32":   # 백본이 다르면 임베딩이 다르므로 캐시를 따로 둔다(B/32 는 예전 캐시 그대로)
        key += "_" + clip_name.replace("/", "").replace("-", "").lower()
    cp = os.path.join(ROOT, "feature_cache", f"real_{key}.pt")
    if os.path.exists(cp):
        d = torch.load(cp, map_location="cpu", weights_only=True)
        return d["feats"], d["y"], files
    feats = []
    for i in range(0, len(files), 32):
        b = torch.stack([preprocess(Image.open(f).convert("RGB")) for f in files[i:i + 32]]).to(device)
        with torch.no_grad():
            e = clip_model.encode_image(b).float()
        feats.append((e / e.norm(dim=-1, keepdim=True)).cpu())
    out = {"feats": torch.cat(feats), "y": torch.tensor(ys, dtype=torch.long)}
    os.makedirs(os.path.dirname(cp), exist_ok=True)
    torch.save(out, cp)
    return out["feats"], out["y"], files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--real-dir", required=True, help="학습용 실사용 이미지 폴더(폴더명=감정)")
    ap.add_argument("--eval-dir", default=None, help="평가용 폴더(폴더명=감정) — 선택·보정에 쓰지 않고 마지막에 보고만")
    ap.add_argument("--base", default=os.path.join(ROOT, "model", "emotion_projection.pt"))
    ap.add_argument("--out", default=os.path.join(ROOT, "model", "emotion_projection_v2.pt"))
    ap.add_argument("--balance", action="store_true", help="실사용 이미지의 감정별 장수 차이를 보정(적은 감정에 더 큰 가중). 장수가 들쭉날쭉할 때 melancholy 같은 소수 감정 재현율에 도움이 될 수 있음")
    ap.add_argument("--real-dir-extra", default=None, help="학습용 폴더를 더 합친다. 쉼표로 여러 개(예: data/train_images2,data/train_images3)")
    ap.add_argument("--emoset-class-weight", default="", help="EmoSet 감정별 가중 배율. 예: dreamy=0.4 (EmoSet awe 가 풍경 사진을 dreamy 로 끌어가는 걸 줄임)")
    ap.add_argument("--emoset-landscape-weight", type=float, default=1.0, help="EmoSet dreamy 샘플 중 '현실 풍경'에 가까운 것만 이 배율로 약하게 학습(예: 0.2). 1=사용 안 함. calm 풍경 사진이 dreamy 로 가는 문제용")
    ap.add_argument("--dump-oof", default=None, help="학습에 안 쓴 이미지(OOF) 예측을 CSV 로 저장(find_label_issues.py 가 라벨 의심 이미지를 찾는 데 씀). 예: results/oof_predictions.csv")
    ap.add_argument("--fit-class-bias", action="store_true", help="OOF 로 감정별 logit 가산값을 맞춰 저장(melancholy·romantic 처럼 정밀도↑·재현율↓인 감정 보정). 서비스는 model/clip_model.py 가 읽어 적용")
    ap.add_argument("--real-weight", default="30", help="실사용 이미지 1장의 가중(EmoSet 1장=1). 쉼표로 여러 개면 OOF 최고 값을 고름")
    ap.add_argument("--max-per-class", type=int, default=3000, help="EmoSet train 클래스당 장수(기존 학습과 같게)")
    ap.add_argument("--val-max-per-class", type=int, default=300)
    ap.add_argument("--epochs", type=int, default=10)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--weight-decay", type=float, default=1e-4)
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--hard-negative-pairs", default=DEFAULT_HN_PAIRS)
    ap.add_argument("--hard-negative-weight", type=float, default=1.0)
    ap.add_argument("--hard-negative-margin", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--clip-model", default="ViT-B/32", help="CLIP 백본(예: ViT-B/16). 바꾸면 EmoSet/실사 임베딩 캐시를 새로 만든다(첫 실행 오래 걸림)")
    args = ap.parse_args()

    import clip
    from feature_cache import get_features
    from model.emotion_mapper import EmotionMapper
    from model.emotion_prompts import build_prompt_ensemble_anchors
    from model.emotion_va_map import SERVICE_VA_ANCHOR, TRAINED_SYNC_EMOTIONS

    device = "cuda" if torch.cuda.is_available() else "cpu"
    names = EmotionMapper().get_all_emotions()
    print(f"서비스 감정(순서): {names} | device={device}")
    clip_model, preprocess = clip.load(args.clip_model, device=device)
    print(f"CLIP 백본: {args.clip_model}")
    clip_model.eval()
    anchors = build_prompt_ensemble_anchors(clip_model, device, names).cpu()        # (8,512)

    # EmoSet(6감정) → 서비스 인덱스로 변환
    to_srv = torch.tensor([names.index(e) for e in TRAINED_SYNC_EMOTIONS])
    ef, el, ev = get_features("train", args.max_per_class, clip_model, preprocess, device, clip_name=args.clip_model)
    vf, vl, _ = get_features("val", args.val_max_per_class, clip_model, preprocess, device, clip_name=args.clip_model)
    emo = (ef, to_srv[el], ev)
    emo_val = (vf, to_srv[vl])

    rf, ry, files = real_features(args.real_dir, names, clip_model, preprocess, device, args.clip_model)
    for extra in [x.strip() for x in str(args.real_dir_extra or "").split(",") if x.strip()]:
        if os.path.isdir(extra):
            rf2, ry2, files2 = real_features(extra, names, clip_model, preprocess, device, args.clip_model)
            rf, ry = torch.cat([rf, rf2]), torch.cat([ry, ry2]); files = files + files2
    bal = balance_factors(ry, len(names)) if args.balance else None
    emo_w = emoset_class_weights(emo[1], names, args.emoset_class_weight)
    if args.emoset_landscape_weight != 1.0:
        with torch.no_grad():
            tf = clip_model.encode_text(clip.tokenize([LANDSCAPE_PROMPT, FANTASY_PROMPT]).to(device)).float()
            tf = (tf / tf.norm(dim=-1, keepdim=True)).cpu()
        lm = landscape_mask(emo[0].cpu(), tf, emo[1], names.index("dreamy"))
        emo_w = (emo_w.clone() if emo_w is not None else torch.ones(len(emo[1])))
        emo_w[lm] = emo_w[lm] * args.emoset_landscape_weight
        n_dreamy = int((emo[1] == names.index("dreamy")).sum())
        print(f"EmoSet dreamy {n_dreamy}장 중 '풍경'에 가까운 {int(lm.sum())}장의 가중을 x{args.emoset_landscape_weight:g} 로 낮춤")
    rv = torch.tensor([SERVICE_VA_ANCHOR[names[int(i)]] for i in ry], dtype=torch.float32)
    real = (rf, ry, rv)
    print(f"학습용 실사용 이미지 {len(ry)}장:", {n: int((ry == i).sum()) for i, n in enumerate(names)})

    hn = parse_pairs(args.hard_negative_pairs, names)
    kw = dict(epochs=args.epochs, lr=args.lr, weight_decay=args.weight_decay, hn_pairs=hn,
              hn_margin=args.hard_negative_margin, hn_weight=args.hard_negative_weight, seed=args.seed, device=device)

    # ── 1) 가중치 후보별 OOF ──────────────────────────────────────────────
    cand = [float(x) for x in str(args.real_weight).split(",") if x.strip()]
    res = {}
    for w in cand:
        z = oof_logits(emo, real, anchors, w, args.folds, kw, bal, emo_w)
        acc = float((z.argmax(1) == ry.numpy()).mean())
        res[w] = (acc, z)
        print(f"[OOF] real_weight={w:g}: 실사용 정확도 {acc:.3f} (학습에 안 쓴 이미지 기준, {args.folds}-fold)")
    best_w = max(cand, key=lambda w: (res[w][0], -w))
    z_oof = res[best_w][1]
    print(f"→ 선택: real_weight={best_w:g}")
    print("  OOF 감정별 재현율:", {n: f"{a}/{b}" for n, (a, b) in recall_table(z_oof.argmax(1), ry.numpy(), names).items()})

    # ── 2) 최종 학습(실사용 전체) ─────────────────────────────────────────
    F_ = torch.cat([emo[0], rf]); Y_ = torch.cat([emo[1], ry]); V_ = torch.cat([emo[2], rv])
    rw_all = torch.full((len(ry),), best_w) * (bal if bal is not None else 1.0)
    W_ = torch.cat([emo_w if emo_w is not None else torch.ones(len(emo[1])), rw_all])
    proj, vah = train_projection(F_, Y_, V_, W_, anchors, **kw)

    # ── 3) 온도 보정: EmoSet val 과 실사용 OOF 를 반반 ─────────────────────
    z_val = cos_logits(proj, emo_val[0], anchors, device)
    yv = to_srv[vl].numpy()
    T = fit_T([(z_val, yv, 0.5), (z_oof, ry.numpy(), 0.5)])
    print(f"\n이미지 온도 T = {T:.4f}  (이전 값은 기존 체크포인트 참고)")
    for tag, z, y in (("EmoSet val(8앵커)", z_val, yv), ("실사용 OOF", z_oof, ry.numpy())):
        p = softmax_np(z / T)
        print(f"  {tag}: acc={(p.argmax(1) == y).mean():.3f} ECE={ece_np(p, y):.3f} 평균 확신도={p.max(1).mean():.3f}")

    if args.dump_oof:
        import csv as _csv
        p_oof = softmax_np(z_oof / T)
        os.makedirs(os.path.dirname(os.path.abspath(args.dump_oof)), exist_ok=True)
        with open(args.dump_oof, "w", encoding="utf-8-sig", newline="") as fh:
            w_ = _csv.writer(fh)
            w_.writerow(["file", "label", "guess", "p_label", "p_guess"])
            for f_, y_, p_ in zip(files, ry.numpy(), p_oof):
                g_ = int(p_.argmax())
                w_.writerow([f_, names[int(y_)], names[g_], f"{p_[int(y_)]:.4f}", f"{p_[g_]:.4f}"])
        print(f"OOF 예측 저장: {args.dump_oof}  (다음: python find_label_issues.py)")

    bias = np.zeros(len(names))
    if args.fit_class_bias:
        bias, f_before, f_after = fit_class_bias(z_oof / T, ry.numpy(), len(names))
        print(f"\n[감정별 가산값] OOF macro-F1 {f_before:.3f} → {f_after:.3f}")
        print("  ", {n: round(float(v), 2) for n, v in zip(names, bias)})
        if f_after - f_before < 0.005:
            print("  개선이 0.005 미만이라 적용하지 않음")
            bias = np.zeros(len(names))

    # ── 4) 평가용 이미지(참고용 — 위 결정에 쓰지 않음) ──────────────────────
    if args.eval_dir and os.path.isdir(args.eval_dir):
        ef2, ey2, _ = real_features(args.eval_dir, names, clip_model, preprocess, device, args.clip_model)
        p = softmax_np(cos_logits(proj, ef2, anchors, device) / T + bias)
        y2 = ey2.numpy()
        print(f"\n[평가용 {args.eval_dir}] n={len(y2)} acc={(p.argmax(1) == y2).mean():.3f} "
              f"ECE={ece_np(p, y2):.3f} 평균 확신도={p.max(1).mean():.3f}")
        print("  감정별 재현율:", {n: f"{a}/{b}" for n, (a, b) in recall_table(p.argmax(1), y2, names).items()})

    # ── 5) 저장(기존 체크포인트의 다른 값은 유지) ─────────────────────────
    ck = torch.load(args.base, map_location="cpu") if os.path.exists(args.base) else {}
    if args.clip_model != ck.get("clip_model", "ViT-B/32"):
        ck = {}   # 다른 백본용 값(텍스트 온도·편향 등)은 이어받지 않는다
    ck.update({
        "clip_model": args.clip_model,
        "projection_state_dict": proj.cpu().state_dict(), "va_head_state_dict": vah.cpu().state_dict(),
        "trained_emotions": list(names), "temperature": float(T),
        "val_acc": float((softmax_np(z_val / T).argmax(1) == yv).mean()),
        "real_oof_acc": float(res[best_w][0]), "real_weight": best_w, "real_images": int(len(ry)),
        "epochs_requested": args.epochs,
        "image_class_bias": [float(v) for v in bias], "image_class_bias_emotions": list(names),
    })
    ck.pop("temperature_both", None)   # w/이미지 경로가 바뀌었으니 복합 온도는 다시 맞춰야 한다
    torch.save(ck, args.out)
    print(f"\n저장: {args.out}  (기존 emotion_projection.pt 는 그대로)")
    print("다음: diagnose_image.py 로 비교 → 좋으면 백업 후 emotion_projection.pt 로 교체, 서버 재시작,\n"
          "      python eval_fusion.py --grid --cv --w 0.1 --save-temperature")


if __name__ == "__main__":
    main()
