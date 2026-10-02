/* ============================================================================
   fourd.c — a 4D ray tracer written from scratch (libc + pthread only)
              "THE FOURTH SIDE"

   DESIGN (why this version is fast and cannot lose work)
   ------------------------------------------------------
   * The room frame and every bar's room-space shadow change ONCE PER SHOT.
     So the facet planes of each shadow zonotope, its AABB, and the 4D->room
     projection are all precomputed in shot_setup() and reused by every ray.
     (The naive version re-derived cross products and support sums per ray.)
   * Rays are tested in room coordinates, along a direction independent of the
     frame; the AABB reject makes most of the ~20 tests per pixel ~10 flops.
   * Tone mapping uses a 4096-entry LUT instead of 3 powf() per pixel.
   * Output is streamed to stdout, so the film never needs scratch frames on
     disk:   ./fourd --stdout ... | encoder
   * Rendering is CHUNKABLE:  --from A --to B renders a slice of the timeline,
     so any interruption costs one chunk, not the whole film.

   geometry: a bar is a box  { c + SUM s_i g_i , |s_i| <= 1 }  in R^4.
   ============================================================================ */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <pthread.h>
#include <time.h>
#include "scene_vals.h"

/* ------------------------------------------------------------------ math --- */
typedef struct { float v[4]; } V4;
static inline V4 v4(float a, float b, float c, float d){ V4 r; r.v[0]=a;r.v[1]=b;r.v[2]=c;r.v[3]=d; return r; }
static inline V4 v4add(V4 a, V4 b){ return v4(a.v[0]+b.v[0],a.v[1]+b.v[1],a.v[2]+b.v[2],a.v[3]+b.v[3]); }
static inline V4 v4mul(V4 a, float s){ return v4(a.v[0]*s,a.v[1]*s,a.v[2]*s,a.v[3]*s); }
static inline float v4dot(V4 a, V4 b){ return a.v[0]*b.v[0]+a.v[1]*b.v[1]+a.v[2]*b.v[2]+a.v[3]*b.v[3]; }
static inline float f3(const float*a, const float*b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
static inline void  sub3(const float*a, const float*b, float*o){ o[0]=a[0]-b[0];o[1]=a[1]-b[1];o[2]=a[2]-b[2]; }
static inline float len3(const float*a){ return sqrtf(f3(a,a)); }
static inline float fracf(float x){ return x - floorf(x); }

/* -------------------------------------------------------------- timeline --- */
typedef struct {
    int   frame, mode, flags;
    float alpha, beta, dist, scale, exposure, stroke;
} Shot;

#define MODE_INK    0
#define MODE_MUSEUM 1
#define FL_FLOOR    1
#define FL_SOFT     2

static Shot *g_shots = NULL;
static int   g_nshots = 0;
static int   g_W = 960, g_H = 540;
static int   g_nthreads = 2;
static int   g_to_stdout = 0;
static int   g_ids = 0;
static int   PLINTH_ON = 1;
static float KEY_K = 1.55f;
static float ADD_C = 0.0f;
static float FOG_K = 0.015f;
static float AMB_S = 1.35f;
static int   FLIP_N = 0;      /* negate the room face normals */
static float PIX_JIT = 0.0f;  /* per-pixel random phase for the shadow taps */
static int   JITTER_ON = 1;
static int   SHADOW_ON = 0;   /* 1 = key light with cast shadows; 0 = shadow-free soft rig (shipped look) */
static unsigned char *g_img = NULL;
static pthread_mutex_t g_out_lock = PTHREAD_MUTEX_INITIALIZER;

/* ------------------------------------------------------------ scene state -- */
typedef struct { V4 c; V4 g[4]; int ng; V4 Minv[4]; float albedo[3]; } Bar;
static Bar g_bar[N_BARS4];
static int g_nbar = N_BARS4;

/* per-shot, precomputed */
static float RB_c[N_BARS4][3];
static float RB_g[N_BARS4][4][3];
static int   RB_ng[N_BARS4];
static float PLN_N[N_BARS4][16][3];
static float PLN_H[N_BARS4][16];
static int   PLN_CNT[N_BARS4];
static float RB_LO[N_BARS4][3], RB_HI[N_BARS4][3];    /* room AABBs */

static float E1R[4] = {0,0,0,0}, E2R[4] = {0,0,0,0}, TROOM[4] = {0,0,0,1};
static float FLOOR_Y = -1.5f, FLOOR_Y0 = -1.5f;
static float PLINTH_C[3] = {0.0f, -1.577f, 26.0f};   /* top surface at room y -1.377 (measured from the reference) */
static float PLINTH_H[3] = {24.0f, 0.20f, 40.0f};
static float STUDIO = 1.0f;
static const float FLOOR_COL[3] = {0.885f, 0.885f, 0.900f};
static const float LIGHT1[3] = {-0.50f, -1.00f, -0.38f};   /* soft key  */
static const float LIGHT2[3] = { 0.70f, -0.25f,  0.45f};   /* fill      */

/* ---------------------------------------------------------------- helpers -- */
static void mat_inv4(const V4 col[4], V4 out[4])   /* out[i] = column i of M^-1 */
{
    double m[4][4], inv[4][4];
    for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) m[i][j] = col[j].v[i];
    for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) inv[i][j] = (i == j) ? 1.0 : 0.0;
    for (int i = 0; i < 4; i++) {
        int piv = i;
        for (int k = i+1; k < 4; k++) if (fabs(m[k][i]) > fabs(m[piv][i])) piv = k;
        if (piv != i) for (int j = 0; j < 4; j++) {
            double t = m[i][j]; m[i][j] = m[piv][j]; m[piv][j] = t;
            t = inv[i][j]; inv[i][j] = inv[piv][j]; inv[piv][j] = t;
        }
        double p = m[i][i];
        if (fabs(p) < 1e-14) continue;
        for (int j = 0; j < 4; j++) { m[i][j] /= p; inv[i][j] /= p; }
        for (int k = 0; k < 4; k++) if (k != i) {
            double f = m[k][i];
            if (f != 0.0) for (int j = 0; j < 4; j++) { m[k][j] -= f*m[i][j]; inv[k][j] -= f*inv[i][j]; }
        }
    }
    for (int i = 0; i < 4; i++) for (int j = 0; j < 4; j++) out[i].v[j] = (float)inv[i][j];
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
        {0.95f, 0.66f, 0.13f},   /* A : brass  */
        {0.10f, 0.30f, 0.88f},   /* B : cobalt */
        {0.88f, 0.16f, 0.10f},   /* C : brick  */
        {0.05f, 0.92f, 0.52f}    /* D : the fourth bar */
    };
    for (int i = 0; i < N_BARS4; i++) {
        g_bar[i].ng = NG[i];
        g_bar[i].c = v4(C[i][0], C[i][1], C[i][2], C[i][3]);
        for (int j = 0; j < NG[i]; j++)
            g_bar[i].g[j] = v4(G[i][j][0], G[i][j][1], G[i][j][2], G[i][j][3]);
        for (int j = NG[i]; j < 4; j++) {           /* pad to a proper 4-box */
            V4 e = v4(0,0,0,0); e.v[j] = 0.006f; g_bar[i].g[j] = e;
        }
        if (i == N_BARS4-1)
            for (int j = 0; j < 4; j++)
                if (v4dot(g_bar[i].g[j], g_bar[i].g[j]) < 1e-12f)
                    g_bar[i].g[j] = v4(0,0,0,0.006f);
        for (int k = 0; k < 3; k++) g_bar[i].albedo[k] = PAL[i][k];
        mat_inv4(g_bar[i].g, g_bar[i].Minv);
    }
    g_nbar = N_BARS4;
}

static inline void room_coords(const float p4[4], float out[3])
{
    out[0] = E1R[0]*p4[0] + E1R[1]*p4[1] + E1R[2]*p4[2] + E1R[3]*p4[3];
    out[1] = E2R[0]*p4[0] + E2R[1]*p4[1] + E2R[2]*p4[2] + E2R[3]*p4[3];
    out[2] = TROOM[0]*p4[0] + TROOM[1]*p4[1] + TROOM[2]*p4[2] + TROOM[3]*p4[3];
}

/* ------------------------------------------------- per-shot precomputation -- */
static void build_planes(int k)
{
    float G[4][3]; int ng = 0;
    for (int j = 0; j < 4; j++) {
        const float *g = RB_g[k][j];
        if (f3(g,g) > 1e-12f) { G[ng][0]=g[0]; G[ng][1]=g[1]; G[ng][2]=g[2]; ng++; }
    }
    int m = 0;
    for (int i = 0; i < ng && m < 16; i++) for (int j = i+1; j < ng && m < 16; j++) {
        float n[3] = { G[i][1]*G[j][2] - G[i][2]*G[j][1],
                       G[i][2]*G[j][0] - G[i][0]*G[j][2],
                       G[i][0]*G[j][1] - G[i][1]*G[j][0] };
        float nl = len3(n);
        if (nl < 1e-9f) continue;
        n[0]/=nl; n[1]/=nl; n[2]/=nl;
        float h = 0.0f;
        for (int q = 0; q < ng; q++) h += fabsf(f3(n, G[q]));
        PLN_N[k][m][0]=n[0]; PLN_N[k][m][1]=n[1]; PLN_N[k][m][2]=n[2];
        PLN_H[k][m]=h; m++;
    }
    PLN_CNT[k] = m;

    /* room AABB of the zonotope: cheap reject for most rays */
    for (int d = 0; d < 3; d++) {
        float lo = RB_c[k][d], hi = RB_c[k][d];
        for (int j = 0; j < ng; j++) {
            float e = fabsf(RB_g[k][j][d]);
            lo -= e; hi += e;
        }
        RB_LO[k][d] = lo; RB_HI[k][d] = hi;
    }
    /* the 3 thin bars are padded with a 0.006 4th generator; the AABB above
       already covers it, so nothing else to do. */
}

static void shot_setup(const Shot *s, int idx_unused)
{
    (void)idx_unused;
    float al = s->alpha, be = s->beta;
    float ca = cosf(al), sa = sinf(al);
    float cb = cosf(be), sb = sinf(be);
    float ax[3] = { cb*MAGIC3[0] + sb*E2_V[0],
                    cb*MAGIC3[1] + sb*E2_V[1],
                    cb*MAGIC3[2] + sb*E2_V[2] };
    float nl = sqrtf(ax[0]*ax[0]+ax[1]*ax[1]+ax[2]*ax[2]);
    ax[0]/=nl; ax[1]/=nl; ax[2]/=nl;

    TROOM[0]=ax[0]; TROOM[1]=ax[1]; TROOM[2]=ax[2]; TROOM[3]=0.0f;
    E1R[0]=E1_V[0]; E1R[1]=E1_V[1]; E1R[2]=E1_V[2]; E1R[3]=0.0f;
    E2R[0]=ca*E2_V[0]; E2R[1]=ca*E2_V[1]; E2R[2]=ca*E2_V[2]; E2R[3]=sa;

    for (int k = 0; k < g_nbar; k++) {
        float c4[4] = {g_bar[k].c.v[0],g_bar[k].c.v[1],g_bar[k].c.v[2],g_bar[k].c.v[3]};
        room_coords(c4, RB_c[k]);
        RB_ng[k] = 0;
        for (int j = 0; j < 4; j++) {
            float g4[4] = {g_bar[k].g[j].v[0],g_bar[k].g[j].v[1],g_bar[k].g[j].v[2],g_bar[k].g[j].v[3]};
            float r[3]; room_coords(g4, r);
            RB_g[k][j][0]=r[0]; RB_g[k][j][1]=r[1]; RB_g[k][j][2]=r[2];
            if (f3(r,r) > 1e-10f) RB_ng[k]++;
        }
        build_planes(k);
    }
    /* the studio dissolves as the observer leaves our space */
    {
        float deg = al*57.29577951f;
        float t = (deg - 18.0f)/26.0f;
        if (t < 0.0f) t = 0.0f; if (t > 1.0f) t = 1.0f;
        STUDIO = 1.0f - t*t*(3.0f - 2.0f*t);
    }
    FLOOR_Y = FLOOR_Y0;
    PLINTH_C[0] = 0.0f; PLINTH_C[2] = 26.0f;
}

/* ------------------------------------------------------------------ hits --- */
static inline int plane_hit(int k, const float O[3], const float D[3], float *tent)
{
    /* AABB reject first (few flops) */
#ifndef NO_AABB
    for (int d = 0; d < 3; d++) {
        float o = O[d], dir = D[d];
        if (fabsf(dir) < 1e-12f) { if (o < RB_LO[k][d] || o > RB_HI[k][d]) return 0; }
        else {
            float t1 = (RB_LO[k][d]-o)/dir, t2 = (RB_HI[k][d]-o)/dir;
            float lo = t1 < t2 ? t1 : t2, hi = t1 < t2 ? t2 : t1;
            if (hi < 0.0f) return 0;
            if (lo > 0.0f) { /* keep going: this is only a reject test */ }
        }
    }
#endif
    const float *c = RB_c[k];
    const float ox = O[0]-c[0], oy = O[1]-c[1], oz = O[2]-c[2];
    float lo = -1e30f, hi = 1e30f;
    int m = PLN_CNT[k];
    if (m < 1) return 0;
    for (int i = 0; i < m; i++) {
        const float *n = PLN_N[k][i];
        float nd = D[0]*n[0] + D[1]*n[1] + D[2]*n[2];
        float nr = ox*n[0] + oy*n[1] + oz*n[2];
        float h  = PLN_H[k][i];
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
    if (hi < 0.0f) return 0;                  /* box entirely behind the ray */
    *tent = (lo < 0.0f) ? 0.0f : lo;          /* origin inside -> own surface */
    return 1;
}

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

/* is the segment A->B blocked by any bar (or the platform)? */
static int seg_blocked(const float A[3], const float B[3], int include_plinth)
{
    float d[3]; sub3(B, A, d);
    float dl = len3(d); if (dl < 1e-6f) return 0;
    d[0]/=dl; d[1]/=dl; d[2]/=dl;
    for (int k = 0; k < g_nbar; k++) {
        float t;
        /* the occluder must lie strictly between A and B: a surface point
           re-intersecting its own box at t <= 0 is NOT a shadow. */
        if (plane_hit(k, A, d, &t) && t > 1e-4f && t < dl - 1e-4f) return 1;
    }
    if (include_plinth && PLINTH_ON) {
        float t, n[3];
        if (plinth_hit(A, d, &t, n) && t < dl) return 1;
    }
    return 0;
}

static float soft_visibility(const float H[3], const float L[3], int taps)
{
    if (SHADOW_ON == 0) return 0.0f;  /* key off entirely        */
    if (SHADOW_ON == 2) return 1.0f;  /* key on, no shadow rays  */
    float vis = 0.0f;
    for (int t = 0; t < taps; t++) {
        float jx = 0, jy = 0, jz = 0;
        if (taps > 1) {
            float ang = 6.28318531f*(float)t/(float)taps + 0.9f + (JITTER_ON ? PIX_JIT*6.28318531f : 0.0f);
            jx = cosf(ang)*0.85f; jz = sinf(ang)*0.85f; jy = 0.15f*sinf(ang*2.0f);
            if (JITTER_ON) {   /* also jitter the tap *height* so the 5 taps sample a 2-D disc */
                float q = PIX_JIT*97.0f - floorf(PIX_JIT*97.0f);
                jy += (q - 0.5f)*1.10f;
            }
        }
        float Ld[3] = {L[0]+jx, L[1]+jy, L[2]+jz};
        float Ll = len3(Ld); Ld[0]/=Ll; Ld[1]/=Ll; Ld[2]/=Ll;
        float B[3] = { H[0]-Ld[0]*90.0f, H[1]-Ld[1]*90.0f, H[2]-Ld[2]*90.0f };
        vis += seg_blocked(H, B, PLINTH_ON) ? 0.0f : 1.0f;
    }
    return vis/(float)taps;
}

static void face_normal_room(int k, int gi, float n3[3])
{
    int idx[2], m = 0;
    for (int j = 0; j < RB_ng[k] && m < 2; j++) if (j != gi) idx[m++] = j;
    float v1[3], v2[3];
    if (m == 2) {
        for (int c = 0; c < 3; c++) { v1[c] = RB_g[k][idx[0]][c]; v2[c] = RB_g[k][idx[1]][c]; }
    } else { v1[0]=v1[1]=v2[0]=v2[1]=0.0f; v1[2]=v2[2]=1.0f; }
    n3[0] = v1[1]*v2[2] - v1[2]*v2[1];
    n3[1] = v1[2]*v2[0] - v1[0]*v2[2];
    n3[2] = v1[0]*v2[1] - v1[1]*v2[0];
    float l = len3(n3);
    if (l > 1e-9f) { n3[0]/=l; n3[1]/=l; n3[2]/=l; } else { n3[0]=0; n3[1]=1; n3[2]=0; }
    if (n3[2] > 0.0f) { n3[0]=-n3[0]; n3[1]=-n3[1]; n3[2]=-n3[2]; }
    if (FLIP_N) { n3[0]=-n3[0]; n3[1]=-n3[1]; n3[2]=-n3[2]; }
}

static void shade_bar(int id, int face, const float p[3], float alb[3],
                      float rgb[3], int flags, int mode)
{
    float n[3];
    (void)face;
    {   /* the point lies on the plane whose constraint is ACTIVE (|v| ~ h);
           that plane's outward normal is the shading normal for this facet */
        float bd = 1e30f; int bm = -1; float bv = 0.0f;
        for (int m = 0; m < PLN_CNT[id]; m++) {
            const float *nm = PLN_N[id][m];
            float v = (p[0]-RB_c[id][0])*nm[0] + (p[1]-RB_c[id][1])*nm[1] + (p[2]-RB_c[id][2])*nm[2];
            float d = fminf(fabsf(v - PLN_H[id][m]), fabsf(v + PLN_H[id][m]));
            if (d < bd) { bd = d; bm = m; bv = v; }
        }
        if (bm >= 0) {
            const float *nm = PLN_N[id][bm];
            float s = bv >= 0.0f ? 1.0f : -1.0f;
            n[0]=s*nm[0]; n[1]=s*nm[1]; n[2]=s*nm[2];
        } else {
            face_normal_room(id, 0, n);
        }
    }
    if (mode == MODE_INK) {
        float up = 0.5f + 0.5f*n[1];
        float f = 0.30f + 0.70f*up;
        for (int i = 0; i < 3; i++) rgb[i] = alb[i]*f*1.05f;
        return;
    }
    int taps = (flags & FL_SOFT) ? 5 : 1;
    float visK = soft_visibility(p, LIGHT1, taps);
    float d1 = fmaxf(0.0f, -(f3(n, LIGHT1))/len3(LIGHT1));
    float d2 = fmaxf(0.0f, -(f3(n, LIGHT2))/len3(LIGHT2));
    float up = 0.5f + 0.5f*n[1];
    float amb[3] = {AMB_S*(0.24f+0.20f*up), AMB_S*(0.25f+0.21f*up), AMB_S*(0.29f+0.22f*up)};
    float back = fmaxf(0.0f, fmaxf(n[0], n[2])*0.5f + fmaxf(-n[0], -n[2])*0.5f);
    float rim = powf(1.0f - fabsf(n[1]), 3.0f);
    for (int i = 0; i < 3; i++)
        rgb[i] = alb[i]*(KEY_K*d1*visK + 0.34f*d2 + amb[i] + 0.26f*back) + 0.07f*rim + ADD_C;
}

/* ------------------------------------------------------------- tone map ---- */
#define TM_N 4096
static float TM_LUT[TM_N+2];
static void build_tone_lut(void)
{
    for (int i = 0; i <= TM_N+1; i++) {
        float x = (float)i/512.0f;
        float c = x*(1.0f + x/11.0f)/(1.0f + x);
        TM_LUT[i] = powf(c, 1.0f/2.2f);
    }
}
static inline float tone_one(float c)
{
    if (c <= 0.0f) return 0.0f;
    float f = c*512.0f;
    if (f >= (float)TM_N) return TM_LUT[TM_N];
    int i = (int)f;
    float d = f - (float)i;
    return TM_LUT[i]*(1.0f-d) + TM_LUT[i+1]*d;
}

/* ---------------------------------------------------------- the renderer --- */
static void render_pixel(int x, int y, const Shot *s, float out[3])
{
    float aspect = (float)g_W/(float)g_H;
    float u = ((float)x + 0.5f)/(float)g_W*2.0f - 1.0f;
    float v = 1.0f - ((float)y + 0.5f)/(float)g_H*2.0f;
    u *= aspect;
    float sc = s->scale;
    float Or[3] = { u*sc, v*sc, -s->dist };   /* look from -z toward +z, as research/design.py does */
    float Dr[3] = { 0.0f, 0.0f, 1.0f };

    float best = 1e30f; int id = -1, face = -1;
    if (s->mode == MODE_MUSEUM && PLINTH_ON && STUDIO > 0.5f) {
        float t, nrm[3];
        if (plinth_hit(Or, Dr, &t, nrm) && t < best) { best = t; id = -2; }
    }
    for (int i = 0; i < g_nbar; i++) {
        float t;
        if (plane_hit(i, Or, Dr, &t) && t < best) { best = t; id = i; }
    }
    float rr[3];
    if (id >= 0) {
        float H[3] = { Or[0]+best*Dr[0], Or[1]+best*Dr[1], Or[2]+best*Dr[2] };
        /* which face did we enter through? */
        face = 0;
        { float bd = 1e30f;
          for (int j = 0; j < RB_ng[id]; j++) {
              float nj[3]; face_normal_room(id, j, nj);
              float dd = fabsf((H[0]-RB_c[id][0])*nj[0] + (H[1]-RB_c[id][1])*nj[1]
                             + (H[2]-RB_c[id][2])*nj[2]);
              if (dd < bd) { bd = dd; face = j; }
          } }
        shade_bar(id, face, H, g_bar[id].albedo, rr, s->flags, s->mode);
        float f = 1.0f - expf(-FOG_K*best*best);
        if (f > 1.0f) f = 1.0f;
        for (int i = 0; i < 3; i++) rr[i] = rr[i]*(1.0f-f) + 1.18f*f;
    } else if (id == -2) {
        float Hp[3] = { Or[0]+best*Dr[0], Or[1]+best*Dr[1], Or[2]+best*Dr[2] };
        float visK = soft_visibility(Hp, LIGHT1, (s->flags & FL_SOFT) ? 5 : 1);
        float tone = 0.50f + 0.60f*visK;
        float refl[3] = {0,0,0};
        float Rm[3] = {Dr[0], -Dr[1], Dr[2]};
        float Rt; int rid = -1; float rbest = 1e30f;
        for (int i = 0; i < g_nbar; i++)
            if (plane_hit(i, Hp, Rm, &Rt) && Rt < rbest) { rbest = Rt; rid = i; }
        if (rid >= 0) {
            float f = 0.30f/(1.0f + 0.012f*rbest*rbest);
            for (int i = 0; i < 3; i++) refl[i] = g_bar[rid].albedo[i]*f;
        }
        for (int i = 0; i < 3; i++) rr[i] = FLOOR_COL[i]*tone*(1.0f - 0.02f*i) + refl[i];
        float vv = (float)y/(float)g_H;
        float vig = 1.0f - 0.22f*(vv-0.5f)*(vv-0.5f)*4.0f;
        for (int i = 0; i < 3; i++) rr[i] *= vig;
        if (STUDIO < 1.0f) {
            float p = 1.0f - STUDIO;
            for (int i = 0; i < 3; i++) rr[i] = rr[i]*STUDIO + (1.22f*(1.0f - 0.012f*i))*p;
        }
    } else if (s->mode == MODE_MUSEUM && STUDIO > 0.02f) {
        float dy = Dr[1];
        int hitfloor = 0; float t = 0.0f;
        if (fabsf(dy) > 1e-9f) { t = (FLOOR_Y - Or[1])/dy; if (t > 0.0f) hitfloor = 1; }
        if (hitfloor) {
            float Hf[3] = {Or[0]+t*Dr[0], FLOOR_Y, Or[2]+t*Dr[2]};
            float visK = soft_visibility(Hf, LIGHT1, (s->flags & FL_SOFT) ? 5 : 1);
            float fall = 1.0f/(1.0f + 0.020f*t*t);
            float tone = (0.52f + 0.55f*fall)*(0.55f + 0.45f*visK);
            float vv = (float)y/(float)g_H;
            float vig = 1.0f - 0.16f*(vv-0.5f)*(vv-0.5f)*4.0f;
            for (int i = 0; i < 3; i++) rr[i] = FLOOR_COL[i]*tone*vig;
        } else {
            float vv = 1.0f - (float)y/(float)g_H;
            float g = 1.20f - 0.20f*vv;
            for (int i = 0; i < 3; i++) rr[i] = g*(1.0f + 0.012f*(2-i));
        }
        if (STUDIO < 1.0f) {
            float p = 1.0f - STUDIO;
            for (int i = 0; i < 3; i++) rr[i] = rr[i]*STUDIO + (1.22f*(1.0f - 0.012f*i))*p;
        }
    } else {
        float g = 2.45f + 0.05f*fracf((float)(x*7+y*13)*0.37f);
        rr[0] = g; rr[1] = g*0.995f; rr[2] = g*0.955f;
    }
    out[0] = rr[0]*s->exposure;
    out[1] = rr[1]*s->exposure;
    out[2] = rr[2]*s->exposure;
}

/* -------------------------------------------------------------- threads ---- */
typedef struct { int y0, y1, idx; } Job;

static void *worker(void *arg)
{
    Job *jb = (Job *)arg;
    const Shot *s = &g_shots[jb->idx];
    float rgb[3];
    unsigned char *row = (unsigned char *)malloc((size_t)g_W*3);
    if (!row) return NULL;
    for (int y = jb->y0; y < jb->y1; y++) {
        for (int x = 0; x < g_W; x++) {
            {   /* cheap per-pixel hash -> [0,1) */
                unsigned h = (unsigned)(x*73856093u) ^ (unsigned)(y*19349663u);
                h ^= h >> 13; h *= 1274126177u; h ^= h >> 16;
                PIX_JIT = (float)(h & 0xffffu)/65536.0f;
            }
            if (g_ids) {
                int pid = -1; float bb = 1e30f;
                float aspect = (float)g_W/(float)g_H;
                float u = ((float)x + 0.5f)/(float)g_W*2.0f - 1.0f;
                float v = 1.0f - ((float)y + 0.5f)/(float)g_H*2.0f; u *= aspect;
                float Or[3] = { u*s->scale, v*s->scale, -s->dist };
                float Dr[3] = { 0.0f, 0.0f, 1.0f };
                for (int i = 0; i < g_nbar; i++) { float t; if (plane_hit(i, Or, Dr, &t) && t < bb) { bb = t; pid = i; } }
                if (g_ids == 2 && pid >= 0) {   /* --face: bar*16 + entry face id */
                    float H[3] = { Or[0]+bb*Dr[0], Or[1]+bb*Dr[1], Or[2]+bb*Dr[2] };
                    int face = 0; float bd = 1e30f;
                    for (int j = 0; j < RB_ng[pid]; j++) {
                        float nj[3]; face_normal_room(pid, j, nj);
                        float dd = fabsf((H[0]-RB_c[pid][0])*nj[0] + (H[1]-RB_c[pid][1])*nj[1]
                                       + (H[2]-RB_c[pid][2])*nj[2]);
                        if (dd < bd) { bd = dd; face = j; }
                    }
                    row[x*3] = (unsigned char)(pid*16 + face);
                } else row[x*3] = (unsigned char)(pid < 0 ? 255 : pid*50);
                row[x*3+1] = 0; row[x*3+2] = 0;
                continue;
            }
            render_pixel(x, y, s, rgb);
            row[x*3+0] = (unsigned char)(tone_one(rgb[0])*255.0f + 0.5f);
            row[x*3+1] = (unsigned char)(tone_one(rgb[1])*255.0f + 0.5f);
            row[x*3+2] = (unsigned char)(tone_one(rgb[2])*255.0f + 0.5f);
        }
        memcpy(g_img + (size_t)y*g_W*3, row, (size_t)g_W*3);
    }
    free(row);
    return NULL;
}

/* ------------------------------------------------------------------ main --- */
int main(int argc, char **argv)
{
    const char *tlpath = NULL, *outdir = NULL;
    int from = 0, to = -1;
    for (int i = 1; i < argc; i++) {
        if (!strcmp(argv[i], "--timeline") && i+1 < argc) tlpath = argv[++i];
        else if (!strcmp(argv[i], "--out") && i+1 < argc) outdir = argv[++i];
        else if (!strcmp(argv[i], "--stdout")) g_to_stdout = 1;
        else if (!strcmp(argv[i], "--w") && i+1 < argc) g_W = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--h") && i+1 < argc) g_H = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--threads") && i+1 < argc) g_nthreads = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--from") && i+1 < argc) from = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--to") && i+1 < argc) to = atoi(argv[++i]);
        else if (!strcmp(argv[i], "--noplinth")) PLINTH_ON = 0;
        else if (!strcmp(argv[i], "--shadow")) SHADOW_ON = 1;
        else if (!strcmp(argv[i], "--noshadow")) SHADOW_ON = 0;
        else if (!strcmp(argv[i], "--noshadowrays")) SHADOW_ON = 2;
        else if (!strcmp(argv[i], "--nojitter")) JITTER_ON = 0;
        else if (!strcmp(argv[i], "--flipn")) FLIP_N = 1;
        else if (!strncmp(argv[i], "--fogk", 6)) FOG_K = strtof(argv[i]+6, NULL);
        else if (!strncmp(argv[i], "--ambs", 6)) AMB_S = strtof(argv[i]+6, NULL);
        else if (!strncmp(argv[i], "--keyk", 6)) KEY_K = strtof(argv[i]+6, NULL);
        else if (!strncmp(argv[i], "--addc", 6)) ADD_C = strtof(argv[i]+6, NULL);
        else if (!strcmp(argv[i], "--ids")) g_ids = 1;
        else if (!strcmp(argv[i], "--face")) g_ids = 2;
    }
    if (!tlpath || (!outdir && !g_to_stdout)) {
        fprintf(stderr, "usage: --timeline T (--out DIR | --stdout) [--w --h --threads --from --to]\n");
        return 1;
    }
    if (g_nthreads < 1) g_nthreads = 1;
    if (g_nthreads > 16) g_nthreads = 16;

    FILE *tf = fopen(tlpath, "r");
    if (!tf) { fprintf(stderr, "no timeline %s\n", tlpath); return 1; }
    int cap = 4096;
    g_shots = (Shot *)malloc(sizeof(Shot)*cap);
    char line[1024];
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
    if (to < 0 || to > g_nshots) to = g_nshots;
    if (from < 0) from = 0;
    if (from >= to) { fprintf(stderr, "empty range %d..%d\n", from, to); return 1; }

    scene_init();
    build_tone_lut();
    /* ground level: lowest point of the three structural bars, in room coords */
    {
        float lo = 1e30f;
        for (int k = 0; k < N_BARS3; k++)
            for (int m = 0; m < 8; m++) {
                float p[4] = { g_bar[k].c.v[0], g_bar[k].c.v[1], g_bar[k].c.v[2], g_bar[k].c.v[3] };
                for (int j = 0; j < 3; j++) {
                    float sgn = ((m>>j)&1) ? 1.0f : -1.0f;
                    p[0] += sgn*g_bar[k].g[j].v[0];
                    p[1] += sgn*g_bar[k].g[j].v[1];
                    p[2] += sgn*g_bar[k].g[j].v[2];
                    p[3] += sgn*g_bar[k].g[j].v[3];
                }
                /* the museum's vertical is the world y axis -- a fixed
                   direction, so the room cannot tilt when alpha rolls the screen */
                if (p[1] < lo) lo = p[1];
            }
        FLOOR_Y0 = lo;
    }
    g_img = (unsigned char *)malloc((size_t)g_W*g_H*3);
    if (g_to_stdout) { setvbuf(stdout, NULL, _IOFBF, 1<<20); }

    fprintf(stderr, "fourd: frames %d..%d of %d  (%dx%d, %d threads)\n",
            from, to, g_nshots, g_W, g_H, g_nthreads);
    clock_t t0 = clock();
    for (int i = from; i < to; i++) {
        shot_setup(&g_shots[i], i);
        pthread_t th[16]; Job jobs[16];
        for (int t = 0; t < g_nthreads; t++) {
            jobs[t].idx = i;
            jobs[t].y0 = g_H*t/g_nthreads;
            jobs[t].y1 = g_H*(t+1)/g_nthreads;
            pthread_create(&th[t], NULL, worker, &jobs[t]);
        }
        for (int t = 0; t < g_nthreads; t++) pthread_join(th[t], NULL);

        if (g_to_stdout) {
            pthread_mutex_lock(&g_out_lock);
            fwrite(g_img, 1, (size_t)g_W*g_H*3, stdout);
            pthread_mutex_unlock(&g_out_lock);
        } else {
            char name[1024];
            sprintf(name, "%s/f%05d.rgb", outdir, i);   /* timeline index */
            FILE *f = fopen(name, "wb");
            if (!f) { fprintf(stderr, "cannot write %s\n", name); return 1; }
            fwrite(g_img, 1, (size_t)g_W*g_H*3, f);
            fclose(f);
        }
        int done = i - from + 1, total = to - from;
        if (done % 25 == 0 || done == total) {
            double el = (double)(clock()-t0)/CLOCKS_PER_SEC;
            fprintf(stderr, "  %5d/%d  (%.1fs elapsed, %.3f s/frame, eta %.0fs)\n",
                    done, total, el, el/done, el/done*(total-done));
        }
    }
    if (g_to_stdout) fflush(stdout);
    fprintf(stderr, "done: %d frames in %.1fs\n", to-from, (double)(clock()-t0)/CLOCKS_PER_SEC);
    return 0;
}