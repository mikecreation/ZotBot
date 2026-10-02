/* ============================================================================
   fourd.c — a 4D ray tracer written from scratch (libc + pthread only)

   Renders the film "THE FOURTH SIDE".

   Geometry: every bar is a box  { c + SUM s_i g_i , |s_i| <= 1 }  in R^4.
   A camera in R^4 has an orthonormal frame (R,U,D): rays start on the 2-plane
   P + u*R + v*U and travel along D.  A ray meets a box iff the slab equations
   are simultaneously satisfiable; the nearest entry wins.

   The 3D "shadow" of the object (the xyz part of the hit) is what we shade:
   that is the sculpture standing in the room.
   ============================================================================ */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <pthread.h>
#include <time.h>
#include "scene_vals.h"

/* ---------------------------------------------------------------- timeline */
typedef struct {
    int   frame, mode, flags;
    float alpha, beta;                 /* turn into the 4th dim ; 3-space tilt */
    float dist, scale, exposure, stroke;
} Shot;

static float E1R[4], E2R[4];          /* image axes, as 4-vectors            */
static float TROOM[4] = {0,0,0,1};    /* the room's depth axis (t(alpha))    */
static float FLOOR_Y0 = 0.0f;         /* ground, measured in room coords     */

/* room-shadow of every bar, rebuilt whenever the room frame changes */
static float RB_c[N_BARS4][3];
static float RB_g[N_BARS4][4][3];
static int   RB_ng[N_BARS4];

static Shot *g_shots = NULL;
static int   g_nshots = 0;
static int   g_W = 1280, g_H = 536;
static unsigned char *g_img = NULL;
static int   g_nthreads = 2;

#define MODE_INK    0
#define MODE_MUSEUM 1
#define FL_FLOOR    1
#define FL_SOFT     2
#define FL_FOG      4

/* ---------------------------------------------------------------- math ---- */
typedef struct { float v[4]; } V4;
static inline V4 v4(float a, float b, float c, float d){ V4 r; r.v[0]=a;r.v[1]=b;r.v[2]=c;r.v[3]=d; return r; }
static inline V4 v4add(V4 a, V4 b){ return v4(a.v[0]+b.v[0],a.v[1]+b.v[1],a.v[2]+b.v[2],a.v[3]+b.v[3]); }
static inline V4 v4sub(V4 a, V4 b){ return v4(a.v[0]-b.v[0],a.v[1]-b.v[1],a.v[2]-b.v[2],a.v[3]-b.v[3]); }
static inline V4 v4mul(V4 a, float s){ return v4(a.v[0]*s,a.v[1]*s,a.v[2]*s,a.v[3]*s); }
static inline float v4dot(V4 a, V4 b){ return a.v[0]*b.v[0]+a.v[1]*b.v[1]+a.v[2]*b.v[2]+a.v[3]*b.v[3]; }
static inline float f3(const float*a, const float*b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
static inline void  sub3(const float*a,const float*b,float*o){ o[0]=a[0]-b[0];o[1]=a[1]-b[1];o[2]=a[2]-b[2]; }
static inline float len3(const float*a){ return sqrtf(f3(a,a)); }
static inline float fracf(float x){ return x - floorf(x); }

static void room_coords(const float p4[4], float out[3])
{
    out[0] = E1R[0]*p4[0] + E1R[1]*p4[1] + E1R[2]*p4[2] + E1R[3]*p4[3];
    out[1] = E2R[0]*p4[0] + E2R[1]*p4[1] + E2R[2]*p4[2] + E2R[3]*p4[3];
    out[2] = TROOM[0]*p4[0] + TROOM[1]*p4[1] + TROOM[2]*p4[2] + TROOM[3]*p4[3];
}

/* ---------------------------------------------------------------- the room */
static float GRID_SY   = 1.0f;
static float STUDIO    = 1.0f;      /* the room fades out as alpha grows */      /* 1/cos(alpha): keeps the figure frozen on screen */
static float FLOOR_Y   = -1.553133f;          /* the object's feet            */
static float PLINTH_C[3] = {0.8652f, -1.70f, -0.8652f};
static float PLINTH_H[3] = {24.0f, 0.20f, 40.0f};  /* flush with the floor, no visible edge */
static int   PLINTH_ON = 1;
static int   IDS_MODE = 0;
static const float FLOOR_COL[3] = {0.885f, 0.885f, 0.900f};

static int plinth_hit(const float *O, const float *D, float *tout, float *nrm)
{
    float lo = -1e30f, hi = 1e30f; int face = -1;
    for (int i = 0; i < 3; i++) {
        float a = O[i] - PLINTH_C[i], h = PLINTH_H[i], d = D[i];
        if (fabsf(d) > 1e-9f) {
            float t1 = (-h - a)/d, t2 = (h - a)/d;
            float l2 = t1 < t2 ? t1 : t2, h2 = t1 < t2 ? t2 : t1;
            if (l2 > lo) { lo = l2; face = i; }
            if (h2 < hi) hi = h2;
        } else if (a < -h || a > h) return 0;
    }
    if (lo > hi || hi < 0.0f) return 0;
    *tout = lo;
    for (int i = 0; i < 3; i++) nrm[i] = 0.0f;
    if (face >= 0) nrm[face] = (D[face] > 0.0f) ? -1.0f : 1.0f;
    return 1;
}

/* ---------------------------------------------------------------- scene --- */
typedef struct {
    V4 c; V4 g[4]; int ng; V4 Minv[4];
    float albedo[3];
    int is4d;
} Bar;

static Bar g_bar[N_BARS4];
static int g_nbar = N_BARS4;

static void mat_inv4(const V4 col[4], V4 out[4])
{
    double m[4][4], inv[4][4];
    int i, j, k;
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) m[i][j] = col[j].v[i];
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) inv[i][j] = (i == j) ? 1.0 : 0.0;
    for (i = 0; i < 4; i++) {
        int piv = i;
        for (k = i+1; k < 4; k++) if (fabs(m[k][i]) > fabs(m[piv][i])) piv = k;
        if (piv != i) for (j = 0; j < 4; j++) {
            double t = m[i][j]; m[i][j] = m[piv][j]; m[piv][j] = t;
            t = inv[i][j]; inv[i][j] = inv[piv][j]; inv[piv][j] = t;
        }
        double p = m[i][i];
        if (fabs(p) < 1e-14) continue;
        for (j = 0; j < 4; j++) { m[i][j] /= p; inv[i][j] /= p; }
        for (k = 0; k < 4; k++) if (k != i) {
            double f = m[k][i];
            if (f != 0.0) for (j = 0; j < 4; j++) { m[k][j] -= f*m[i][j]; inv[k][j] -= f*inv[i][j]; }
        }
    }
    for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) out[i].v[j] = (float)inv[i][j];  /* out[i] = column i of M^-1 */
}

static void scene_init(void)
{
    static const float *C[N_BARS4] = {BAR0_C, BAR1_C, BAR2_C, BAR3_C};
    static const float *G[N_BARS4][4] = {
        {BAR0_G0, BAR0_G1, BAR0_G2, NULL}, {BAR1_G0, BAR1_G1, BAR1_G2, NULL},
        {BAR2_G0, BAR2_G1, BAR2_G2, NULL}, {BAR3_G0, BAR3_G1, BAR3_G2, BAR3_G3}
    };
    static const int NG[N_BARS4] = {BAR0_NG, BAR1_NG, BAR2_NG, BAR3_NG};
    static const float PAL[4][3] = {
        {0.95f, 0.66f, 0.13f},   /* A : brass   */
        {0.10f, 0.30f, 0.88f},   /* B : cobalt  */
        {0.88f, 0.16f, 0.10f},   /* C : brick   */
        {0.05f, 0.92f, 0.52f}    /* D : the fourth bar */
    };
    for (int i = 0; i < N_BARS4; i++) {
        g_bar[i].ng = NG[i];
        g_bar[i].c = v4(C[i][0], C[i][1], C[i][2], C[i][3]);
        for (int j = 0; j < NG[i]; j++)
            g_bar[i].g[j] = v4(G[i][j][0], G[i][j][1], G[i][j][2], G[i][j][3]);
        /* pad the three 3D bars with a thin 4th generator so that the slab
           test sees a proper 4-box (does not change their 3D shadow) */
        for (int j = NG[i]; j < 4; j++) {
            V4 e = v4(0,0,0,0); e.v[j] = 0.006f; g_bar[i].g[j] = e;
        }
        if (i == N_BARS4-1) {
            for (int j = 0; j < 4; j++)
                if (v4dot(g_bar[i].g[j], g_bar[i].g[j]) < 1e-12f)
                    g_bar[i].g[j] = v4(0,0,0,0.006f);
        }
        g_bar[i].is4d = (i == N_BARS4-1);
        for (int k = 0; k < 3; k++) g_bar[i].albedo[k] = PAL[i][k];
        mat_inv4(g_bar[i].g, g_bar[i].Minv);
    }
    g_nbar = N_BARS4;
}

/* ---------------------------------------------------------------- hits ---- */
typedef struct { int id; float t; float p[3]; int face; V4 p4; } Hit;

static int bar_hit(const Bar *b, V4 O, V4 D, float *t_lo, int *face)
{
    float lo = -1e30f, hi = 1e30f; int best = -1;
    float ra[4] = {O.v[0]-b->c.v[0], O.v[1]-b->c.v[1], O.v[2]-b->c.v[2], O.v[3]-b->c.v[3]};
    float da[4] = {D.v[0],D.v[1],D.v[2],D.v[3]};
    for (int i = 0; i < 4; i++) {
        float ai = b->Minv[i].v[0]*ra[0] + b->Minv[i].v[1]*ra[1]
                 + b->Minv[i].v[2]*ra[2] + b->Minv[i].v[3]*ra[3];
        float mi = b->Minv[i].v[0]*da[0] + b->Minv[i].v[1]*da[1]
                 + b->Minv[i].v[2]*da[2] + b->Minv[i].v[3]*da[3];
        if (mi > 1e-9f || mi < -1e-9f) {
            float t1 = (-1.f - ai)/mi, t2 = (1.f - ai)/mi;
            float l2 = t1 < t2 ? t1 : t2, h2 = t1 < t2 ? t2 : t1;
            if (l2 > lo) { lo = l2; best = i; }
            if (h2 < hi) hi = h2;
        } else if (ai < -1.f || ai > 1.f) return 0;
    }
    if (lo > hi) return 0;          /* orthographic rays are infinite lines */
    *t_lo = lo; *face = best;
    return 1;
}

/* 3D (xyz) entry test of a bar seen along a 3-space direction */
static int zonotope3_hit(const float ctr[3], const float G0[4][3], int ng0,
                         const float O[3], const float D[3], float *tent)
{
    float G[4][3]; int ng = 0; (void)ng0;
    for (int j = 0; j < 4; j++) {
        if (f3(G0[j],G0[j]) > 1e-12f) { G[ng][0]=G0[j][0]; G[ng][1]=G0[j][1]; G[ng][2]=G0[j][2]; ng++; }
    }
    if (ng < 2) return 0;
    float rel[3] = {ctr[0]-O[0], ctr[1]-O[1], ctr[2]-O[2]};
    float lo = -1e30f, hi = 1e30f;
    for (int i = 0; i < ng; i++) for (int j = i+1; j < ng; j++) {
        float n[3] = { G[i][1]*G[j][2] - G[i][2]*G[j][1],
                       G[i][2]*G[j][0] - G[i][0]*G[j][2],
                       G[i][0]*G[j][1] - G[i][1]*G[j][0] };
        float nl = len3(n); if (nl < 1e-9f) continue;
        n[0]/=nl; n[1]/=nl; n[2]/=nl;
        float h = 0.0f; for (int q = 0; q < ng; q++) h += fabsf(f3(n, G[q]));
        float nd = f3(n, D), nr = f3(n, rel);
        if (fabsf(nd) < 1e-9f) { if (fabsf(nr) > h) return 0; }
        else {
            float t1 = (-h - nr)/nd, t2 = (h - nr)/nd;
            float l2 = t1 < t2 ? t1 : t2, h2 = t1 < t2 ? t2 : t1;
            if (l2 > lo) lo = l2;
            if (h2 < hi) hi = h2;
            if (lo > hi) return 0;
        }
    }
    if (lo > hi) return 0;
    *tent = lo;
    return 1;
}

/* ---------------------------------------------------------------- light --- */
static const float LIGHT1[3] = {-0.50f, -1.00f, -0.38f};   /* soft key, travels down-left-back */
static const float LIGHT2[3] = { 0.70f, -0.25f,  0.45f};   /* fill from the other side        */

/* is the segment A -> B occluded by the object (or the plinth)? */
static int seg_blocked(const float A[3], const float B[3], int include_plinth)
{
    float d[3]; sub3(B, A, d);
    float dl = len3(d); if (dl < 1e-6f) return 0;
    for (int i = 0; i < 3; i++) d[i] /= dl;
    for (int k = 0; k < g_nbar; k++) {
        float t;
        if (zonotope3_hit(RB_c[k], RB_g[k], RB_ng[k], A, d, &t) && t < dl) return 1;
    }
    if (include_plinth && PLINTH_ON) {
        float t, n[3];
        if (plinth_hit(A, d, &t, n) && t < dl) return 1;
    }
    return 0;
}

/* ---------------------------------------------------------------- shading - */
static void face_normal_room(int k, int gi, float n3[3])
{
    /* normal of the shadow facet opposite generator gi: the cross product of the
       two generators that are NOT gi (the thin ones) -- oriented toward the eye */
    float v1[3], v2[3]; int c = 0;
    for (int j = 0; j < RB_ng[k] && c < 2; j++) {
        if (j == gi) continue;
        v1[0]=RB_g[k][j][0]; v1[1]=RB_g[k][j][1]; v1[2]=RB_g[k][j][2];
        if (c == 0) { v2[0]=v1[0]; v2[1]=v1[1]; v2[2]=v1[2]; }
        c++;
    }
    if (RB_ng[k] >= 3) {
        int idx[2], m = 0;
        for (int j = 0; j < RB_ng[k] && m < 2; j++) if (j != gi) idx[m++] = j;
        v1[0]=RB_g[k][idx[0]][0]; v1[1]=RB_g[k][idx[0]][1]; v1[2]=RB_g[k][idx[0]][2];
        v2[0]=RB_g[k][idx[1]][0]; v2[1]=RB_g[k][idx[1]][1]; v2[2]=RB_g[k][idx[1]][2];
    } else { v1[0]=v2[0]=0; v1[1]=v2[1]=0; v1[2]=v2[2]=1; }
    n3[0] = v1[1]*v2[2] - v1[2]*v2[1];
    n3[1] = v1[2]*v2[0] - v1[0]*v2[2];
    n3[2] = v1[0]*v2[1] - v1[1]*v2[0];
    float l = len3(n3);
    if (l > 1e-9f) { n3[0]/=l; n3[1]/=l; n3[2]/=l; } else { n3[0]=0; n3[1]=1; n3[2]=0; }
    if (n3[2] > 0.0f) { n3[0]=-n3[0]; n3[1]=-n3[1]; n3[2]=-n3[2]; }   /* face the eye (eye at +z) */
}

static float soft_visibility(const float H[3], const float L[3], int taps)
{
    float vis = 0.0f;
    for (int t = 0; t < taps; t++) {
        float jx = 0, jz = 0, jy = 0;
        if (taps > 1) {
            float ang = 6.28318531f*(float)t/(float)taps + 0.9f;
            jx = cosf(ang)*0.85f; jz = sinf(ang)*0.85f; jy = 0.15f*sinf(ang*2.0f);
        }
        float Ld[3] = {L[0]+jx, L[1]+jy, L[2]+jz};
        float Ll = len3(Ld); Ld[0]/=Ll; Ld[1]/=Ll; Ld[2]/=Ll;
        float B[3] = { H[0] - Ld[0]*90.0f, H[1] - Ld[1]*90.0f, H[2] - Ld[2]*90.0f };
        vis += seg_blocked(H, B, PLINTH_ON) ? 0.0f : 1.0f;
    }
    return vis/(float)taps;
}

static void shade_bar(const Hit *h, float rgb[3], int flags, int mode)
{
    const Bar *b = &g_bar[h->id];
    const float *A = b->albedo;
    float n[3]; face_normal_room(h->id, h->face, n);
    if (mode == MODE_INK) {
        /* ink on paper: flat pigment with just enough shading to read the form */
        float up = 0.5f + 0.5f*n[1];
        float f = 0.30f + 0.70f*up;
        for (int i = 0; i < 3; i++) rgb[i] = A[i]*f*1.05f;
        return;
    }
    int taps = (flags & FL_SOFT) ? 5 : 1;
    float visK = soft_visibility(h->p, LIGHT1, taps);
    float d1 = fmaxf(0.0f, -(f3(n, LIGHT1))/len3(LIGHT1));
    float d2 = fmaxf(0.0f, -(f3(n, LIGHT2))/len3(LIGHT2));
    float up = 0.5f + 0.5f*n[1];
    float amb[3] = {0.24f+0.20f*up, 0.25f+0.21f*up, 0.29f+0.22f*up};
    float back = fmaxf(0.0f, fmaxf(n[0], n[2])*0.5f + fmaxf(-n[0], -n[2])*0.5f);
    float rim = powf(1.0f - fabsf(n[1]), 3.0f);
    for (int i = 0; i < 3; i++)
        rgb[i] = A[i]*(1.55f*d1*visK + 0.34f*d2 + amb[i] + 0.26f*back) + 0.07f*rim;
}

/* ---------------------------------------------------------------- camera -- */
static void tone_map(float rgb[3])
{
    for (int i = 0; i < 3; i++) {
        float c = rgb[i];
        c = c*(1.0f + c/11.0f)/(1.0f + c);
        c = powf(c, 1.0f/2.2f);
        rgb[i] = c;
    }
}

static void render_pixel(int x, int y, const Shot *s, float out[3])
{
    float aspect = (float)g_W/(float)g_H;
    float u = ((float)x + 0.5f)/(float)g_W*2.0f - 1.0f;
    float v = 1.0f - ((float)y + 0.5f)/(float)g_H*2.0f;
    u *= aspect;
    /* the room: x = right, y = up (scaled by 1/cos alpha so the figure is frozen),
              z = away from the eye */
    float sc = s->scale;
    float Or[3] = { u*sc, v*sc*GRID_SY, s->dist };
    float Dr[3] = { 0.0f, 0.0f, -1.0f };

    float best = 1e30f; int id = -1, face = -1; float H[3] = {0,0,0};
    if (s->mode == MODE_MUSEUM && PLINTH_ON && STUDIO > 0.5f) {
        float t, nrm[3];
        if (plinth_hit(Or, Dr, &t, nrm) && t < best) { best = t; id = -2; }
    }
    for (int i = 0; i < g_nbar; i++) {
        float t;
        if (zonotope3_hit(RB_c[i], RB_g[i], RB_ng[i], Or, Dr, &t) && t < best) {
            best = t; id = i; face = -1;
            /* which generator is the facet we entered through?  take the one whose
               plane the entry point lies on */
            H[0] = Or[0] + t*Dr[0]; H[1] = Or[1] + t*Dr[1]; H[2] = Or[2] + t*Dr[2];
            float bestd = 1e30f;
            for (int j = 0; j < RB_ng[i]; j++) {
                float nj[3];
                face_normal_room(i, j, nj);
                float dd = fabsf((H[0]-RB_c[i][0])*nj[0] + (H[1]-RB_c[i][1])*nj[1] + (H[2]-RB_c[i][2])*nj[2]);
                if (dd < bestd) { bestd = dd; face = j; }
            }
        }
    }
    float rr[3];
    if (id >= 0) {
        Hit h; h.id = id; h.t = best; h.face = (face < 0 ? 0 : face);
        h.p[0] = Or[0]+best*Dr[0]; h.p[1] = Or[1]+best*Dr[1]; h.p[2] = Or[2]+best*Dr[2];
        shade_bar(&h, rr, s->flags, s->mode);
        float f = 1.0f - expf(-0.010f*best*best);
        if (f > 1.0f) f = 1.0f;
        for (int i = 0; i < 3; i++) rr[i] = rr[i]*(1.0f-f) + 1.18f*f;
    } else if (id == -2) {
        float Hp[3] = {Or[0]+best*Dr[0], Or[1]+best*Dr[1], Or[2]+best*Dr[2]};
        if (STUDIO < 1.0f) {
            /* dissolve the platform into paper along with the room */
            float p = 1.0f - STUDIO;
            float keep = STUDIO;
            float tone0 = 0.62f;
            float visK0 = soft_visibility(Hp, LIGHT1, 1);
            float tt = 0.55f + 0.45f*visK0;
            for (int i = 0; i < 3; i++) {
                out[i] = (FLOOR_COL[i]*tt*(1.0f - 0.02f*i))*keep
                       + (1.22f*(1.0f - 0.012f*i))*p;
                out[i] *= s->exposure;
            }
            (void)tone0;
            return;
        }
        float visK = soft_visibility(Hp, LIGHT1, (s->flags & FL_SOFT) ? 5 : 1);
        float tone = 0.50f + 0.60f*visK;
        float refl[3] = {0,0,0};
        float Rm[3] = {Dr[0], -Dr[1], Dr[2]};
        float Rt; int rid = -1; float rbest = 1e30f;
        for (int i = 0; i < g_nbar; i++)
            if (zonotope3_hit(RB_c[i], RB_g[i], RB_ng[i], Hp, Rm, &Rt) && Rt < rbest) { rbest = Rt; rid = i; }
        if (rid >= 0) {
            float f = 0.30f/(1.0f + 0.012f*rbest*rbest);
            for (int i = 0; i < 3; i++) refl[i] = g_bar[rid].albedo[i]*f;
        }
        for (int i = 0; i < 3; i++) rr[i] = FLOOR_COL[i]*tone*(1.0f - 0.02f*i) + refl[i];
        float vv = (float)y/(float)g_H;
        float vig = 1.0f - 0.22f*(vv-0.5f)*(vv-0.5f)*4.0f;
        for (int i = 0; i < 3; i++) rr[i] *= vig;
    } else {
        if (s->mode == MODE_MUSEUM && STUDIO > 0.02f) {
            float dy = Dr[1];
            int hitfloor = 0; float t = 0.0f;
            if (fabsf(dy) > 1e-9f) { t = (FLOOR_Y - Or[1])/dy; if (t > 0.0f) hitfloor = 1; }
            if (hitfloor) {
                float Hf[3] = {Or[0]+t*Dr[0], FLOOR_Y, Or[2]+t*Dr[2]};
                float dist = t;
                float visK = soft_visibility(Hf, LIGHT1, (s->flags & FL_SOFT) ? 5 : 1);
                float fall = 1.0f/(1.0f + 0.020f*dist*dist);
                float tone = (0.52f + 0.55f*fall)*(0.55f + 0.45f*visK);
                float vv = (float)y/(float)g_H;
                float vig = 1.0f - 0.16f*(vv-0.5f)*(vv-0.5f)*4.0f;
                for (int i = 0; i < 3; i++) rr[i] = FLOOR_COL[i]*tone*vig;
            } else {
                float vv = 1.0f - (float)y/(float)g_H;
                float g = 1.20f - 0.20f*vv;
                for (int i = 0; i < 3; i++) rr[i] = g*(1.0f + 0.012f*(2-i));
            }
            /* blend the whole room toward paper as the studio dissolves */
            if (STUDIO < 1.0f) {
                float p = 1.0f - STUDIO;
                for (int i = 0; i < 3; i++) rr[i] = rr[i]*STUDIO + (1.22f*(1.0f - 0.012f*i))*p;
            }
        } else {
            float g = 2.45f + 0.05f*fracf((float)(x*7+y*13)*0.37f);
            rr[0] = g; rr[1] = g*0.995f; rr[2] = g*0.955f;
        }
    }
    out[0] = rr[0]*s->exposure;
    out[1] = rr[1]*s->exposure;
    out[2] = rr[2]*s->exposure;
}

/* ---------------------------------------------------------------- threads - */
typedef struct { int y0, y1, idx; } Job;

static void *worker(void *arg)
{
    Job *jb = (Job *)arg;
    float rgb[3];
    unsigned char *row = (unsigned char *)malloc((size_t)g_W*3);
    if (!row) return NULL;
    for (int y = jb->y0; y < jb->y1; y++) {
        for (int x = 0; x < g_W; x++) {
            render_pixel(x, y, &g_shots[jb->idx], rgb);
            if (IDS_MODE) {
                int pid = -1; float bb = 1e30f;
                { float aspect = (float)g_W/(float)g_H;
                  float u = ((float)x + 0.5f)/(float)g_W*2.0f - 1.0f;
                  float v = 1.0f - ((float)y + 0.5f)/(float)g_H*2.0f; u *= aspect;
                  float sc = g_shots[jb->idx].scale;
                  float Or[3] = { u*sc, v*sc*GRID_SY, g_shots[jb->idx].dist };
                  float Dr[3] = { 0.0f, 0.0f, -1.0f };
                  for (int i = 0; i < g_nbar; i++) { float t; if (zonotope3_hit(RB_c[i], RB_g[i], RB_ng[i], Or, Dr, &t) && t < bb) { bb = t; pid = i; } } }
                row[x*3]   = (unsigned char)(pid < 0 ? 255 : pid*50);
                row[x*3+1] = 0; row[x*3+2] = 0;
                continue;
            }
            tone_map(rgb);
            for (int i = 0; i < 3; i++) {
                int q = (int)(rgb[i]*255.0f + 0.5f);
                row[x*3+i] = (unsigned char)(q < 0 ? 0 : (q > 255 ? 255 : q));
            }
        }
        memcpy(g_img + (size_t)y*g_W*3, row, (size_t)g_W*3);
    }
    free(row);
    return NULL;
}

/* ---------------------------------------------------------------- io ------ */
int main(int argc, char **argv)
{
    const char *tlpath = NULL, *outdir = NULL;
    int i;
    for (i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--timeline") && i+1 < argc) tlpath = argv[++i];
        else if (!strcmp(argv[i], "--out") && i+1 < argc) outdir = argv[++i];
        else if (!strcmp(argv[i], "--w") && i+1 < argc) g_W = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--h") && i+1 < argc) g_H = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--threads") && i+1 < argc) g_nthreads = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--noplinth")) PLINTH_ON = 0;
        else if (!strcmp(argv[i], "--ids")) IDS_MODE = 1;
    }
    if (!tlpath || !outdir) { fprintf(stderr, "usage: --timeline T --out DIR [--w --h --threads]\n"); return 1; }
    if (g_nthreads < 1) g_nthreads = 1;
    if (g_nthreads > 8) g_nthreads = 8;

    FILE *tf = fopen(tlpath, "r");
    if (!tf) { fprintf(stderr, "no timeline %s\n", tlpath); return 1; }
    int cap = 4096;
    g_shots = (Shot *)malloc(sizeof(Shot)*cap);
    char line[2048];
    while (fgets(line, sizeof(line), tf)) {
        Shot s;
        if (line[0] == '#' || line[0] == '\n') continue;
        int n = sscanf(line, "%d %d %d %f %f %f %f %f %f",
            &s.frame, &s.mode, &s.flags,
            &s.alpha, &s.beta, &s.dist, &s.scale, &s.exposure, &s.stroke);
        if (n < 9) { fprintf(stderr, "bad timeline line: %s", line); return 1; }
        if (g_nshots >= cap) { cap *= 2; g_shots = (Shot *)realloc(g_shots, sizeof(Shot)*cap); }
        g_shots[g_nshots++] = s;
    }
    fclose(tf);
    if (!g_nshots) { fprintf(stderr, "empty timeline\n"); return 1; }

    scene_init();
    for (int j = 0; j < 3; j++) { E1R[j] = E1_V[j]; E2R[j] = E2_V[j]; }
    E1R[3] = 0.0f; E2R[3] = 0.0f;

    /* the ground: the lowest point of the sculpture's own bounding box,
       measured in the observer's room (so the slab always touches its feet) */
    {
        float lo = 1e30f;
        for (int k = 0; k < N_BARS3; k++)
            for (int m = 0; m < 8; m++) {
                float p[4] = {0,0,0,0};
                p[0] = g_bar[k].c.v[0]; p[1] = g_bar[k].c.v[1];
                p[2] = g_bar[k].c.v[2]; p[3] = g_bar[k].c.v[3];
                for (int j = 0; j < 3; j++) {
                    float s = ((m>>j)&1) ? 1.0f : -1.0f;
                    p[0] += s*g_bar[k].g[j].v[0]; p[1] += s*g_bar[k].g[j].v[1];
                    p[2] += s*g_bar[k].g[j].v[2]; p[3] += s*g_bar[k].g[j].v[3];
                }
                float r[3]; room_coords(p, r);
                if (r[1] < lo) lo = r[1];
            }
        FLOOR_Y0 = lo;
    }
    FLOOR_Y = FLOOR_Y0;
    PLINTH_C[0] = OBJ_CENTER[0];
    PLINTH_C[2] = OBJ_CENTER[2];
    PLINTH_C[1] = FLOOR_Y - 0.145f;
    g_img = (unsigned char *)malloc((size_t)g_W*g_H*3);
    fprintf(stderr, "fourd: %d shots, %dx%d, %d threads\n", g_nshots, g_W, g_H, g_nthreads);
    clock_t t0 = clock();
    for (i = 0; i < g_nshots; i++) {
        pthread_t th[8]; Job jobs[8];
        /* ------------------------------------------------------------------
           build the observer's room for this frame.

           view axis      T  = ax(beta)                      (inside 3-space)
           screen axes    R  = e1                 (fixed, always perpendicular)
                          U  = cos(a) e2 + sin(a) u_w  orthogonalised vs T
           casting dir.   C  = the unit 4-vector perpendicular to (R,U,T)
           With those, the object's shadow onto the room is the coordinate map
              p  ->  (p.R, p.U, p.T)
           and because R and U never see the w dependence of the 3-space bars,
           the figure is bit-for-bit frozen while the 4th bar (along u_w) grows
           in the room at length 5.2 sin(a).
           ------------------------------------------------------------------ */
        float al = g_shots[i].alpha, be = g_shots[i].beta;
        float ca = cosf(al), sa = sinf(al);
        float cb = cosf(be), sb = sinf(be);
        float ax[3] = { cb*MAGIC3[0] + sb*E2_V[0],
                        cb*MAGIC3[1] + sb*E2_V[1],
                        cb*MAGIC3[2] + sb*E2_V[2] };
        float nl = sqrtf(ax[0]*ax[0]+ax[1]*ax[1]+ax[2]*ax[2]);
        ax[0]/=nl; ax[1]/=nl; ax[2]/=nl;
        float T4[4] = { ax[0], ax[1], ax[2], 0.0f };
        float R4[4] = { E1_V[0], E1_V[1], E1_V[2], 0.0f };
        float U4[4] = { ca*E2_V[0], ca*E2_V[1], ca*E2_V[2], sa };
        float du = U4[0]*T4[0]+U4[1]*T4[1]+U4[2]*T4[2]+U4[3]*T4[3];
        for (int j = 0; j < 4; j++) U4[j] -= du*T4[j];
        float ul = sqrtf(U4[0]*U4[0]+U4[1]*U4[1]+U4[2]*U4[2]+U4[3]*U4[3]);
        if (ul > 1e-9f) for (int j = 0; j < 4; j++) U4[j] /= ul;

        for (int j = 0; j < 4; j++) {
            E1R[j] = R4[j];
            E2R[j] = U4[j];
            TROOM[j] = T4[j];
        }
        /* project every 4D bar into the room */
        GRID_SY = 1.0f;   /* the foreshortening is the drama: let it show */
        for (int k = 0; k < g_nbar; k++) {
            float c4[4] = {g_bar[k].c.v[0],g_bar[k].c.v[1],g_bar[k].c.v[2],g_bar[k].c.v[3]};
            float r[3];
            room_coords(c4, r); RB_c[k][0]=r[0]; RB_c[k][1]=r[1]; RB_c[k][2]=r[2];
            RB_ng[k] = 0;
            for (int j = 0; j < 4; j++) {
                float g4[4] = {g_bar[k].g[j].v[0],g_bar[k].g[j].v[1],g_bar[k].g[j].v[2],g_bar[k].g[j].v[3]};
                room_coords(g4, r);
                RB_g[k][j][0]=r[0]; RB_g[k][j][1]=r[1]; RB_g[k][j][2]=r[2];
                if (f3(r,r) > 1e-10f) RB_ng[k]++;
            }
        }
        FLOOR_Y = FLOOR_Y0;
        PLINTH_C[0] = 0.0f; PLINTH_C[2] = -26.0f;
        {
            float deg = al*57.29577951f;
            float t = (deg - 18.0f)/26.0f;
            if (t < 0.0f) t = 0.0f; if (t > 1.0f) t = 1.0f;
            STUDIO = 1.0f - t*t*(3.0f - 2.0f*t);
        }
        for (int t = 0; t < g_nthreads; t++) {
            jobs[t].idx = i;
            jobs[t].y0 = g_H*t/g_nthreads;
            jobs[t].y1 = g_H*(t+1)/g_nthreads;
            pthread_create(&th[t], NULL, worker, &jobs[t]);
        }
        for (int t = 0; t < g_nthreads; t++) pthread_join(th[t], NULL);
        char name[1024];
        sprintf(name, "%s/f%05d.rgb", outdir, g_shots[i].frame);
        FILE *f = fopen(name, "wb");
        if (!f) { fprintf(stderr, "cannot write %s\n", name); return 1; }
        fwrite(g_img, 1, (size_t)g_W*g_H*3, f);
        fclose(f);
        if ((i % 20) == 0) {
            double el = (double)(clock()-t0)/CLOCKS_PER_SEC;
            fprintf(stderr, "  frame %d/%d  (%.1fs elapsed, %.3f s/frame)\n",
                    i+1, g_nshots, el, el/(i+1));
        }
    }
    fprintf(stderr, "done: %d frames in %.1fs\n", g_nshots, (double)(clock()-t0)/CLOCKS_PER_SEC);
    return 0;
}