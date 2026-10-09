package com.graduate.Sync.util;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 검색 결과의 아티스트 이름이 실제로 찾던 아티스트와 같은지 검증하는 공용 유틸.
 * Spotify/iTunes 검색은 텍스트 유사도로 대충 맞는 결과를 반환하는 경우가 많아서,
 * 엉뚱한 동명이인/유사명 아티스트를 그대로 보여주지 않도록 오매칭을 걸러낸다.
 */
public final class MatchUtils {

    private MatchUtils() {}

    public static boolean artistMatches(String a, String b) {
        if (a == null || b == null) return false;
        Set<String> va = variants(a);
        Set<String> vb = variants(b);
        for (String x : va)
            for (String y : vb)
                if (similar(x, y)) return true;
        return false;
    }

    private static boolean similar(String na, String nb) {
        if (na.isEmpty() || nb.isEmpty()) return false;
        if (na.equals(nb)) return true;
        // 이름이 짧을수록 Levenshtein 비율이 부정확해짐(예: 3~4글자에서 1글자만 달라도
        // threshold를 넘어버림) — 더 짧은 쪽이 4자 미만이면 정확히 일치할 때만 인정
        if (Math.min(na.length(), nb.length()) < 4) return false;
        int maxLen = Math.max(na.length(), nb.length());
        double similarity = (double) (maxLen - levenshtein(na, nb)) / maxLen;
        return similarity >= 0.80;
    }

    private static final Pattern PAREN = Pattern.compile("\\(([^)]*)\\)");
    private static final Pattern COLLAB = Pattern.compile(
            "\\s*(?:&|,|/|\\+|\\bfeat\\.?\\s|\\bft\\.?\\s|\\bwith\\s|\\band\\s|\\bx\\s)\\s*");

    /**
     * 비교용 변형 목록. 한 이름에서 다음을 모두 뽑아 서로 하나라도 맞으면 같은 아티스트로 본다.
     *  - 전체 이름 (구두점·공백 제거: "Cho Yong-pil" = "Cho Yong Pil", "K.Will" = "K Will")
     *  - 괄호 바깥 / 괄호 안 ("투빅(2BiC)" → "투빅", "2bic")
     *  - 협업 표기 분리 ("K.Will & BAEKHYUN" → "kwill", "baekhyun")
     */
    static Set<String> variants(String name) {
        Set<String> out = new LinkedHashSet<>();
        String lower = name.toLowerCase(Locale.ROOT).trim();
        addCompact(out, lower);

        Matcher m = PAREN.matcher(lower);
        while (m.find()) addCompact(out, m.group(1));

        String noParen = lower.replaceAll("\\([^)]*\\)", " ").trim();
        addCompact(out, noParen);
        for (String part : COLLAB.split(noParen + " ")) addCompact(out, part);

        // 한글·영문·일문이 한 이름에 섞인 표기("Dong Bang Shin Ki동방신기 (Tohoshinki東方神起)")는
        // 문자 종류별 덩어리로도 쪼개서 비교한다 → "dongbangshinki", "동방신기", "tohoshinki" ...
        for (Matcher r = SCRIPT_RUN.matcher(lower); r.find(); ) addCompact(out, r.group());
        return out;
    }

    private static final Pattern SCRIPT_RUN = Pattern.compile(
            "[\\p{IsHangul}]+|[a-z0-9][a-z0-9 .'\\-]*[a-z0-9]|[a-z0-9]|[\\p{IsHan}\\p{IsHiragana}\\p{IsKatakana}]+");

    private static void addCompact(Set<String> out, String s) {
        String t = s.trim();
        if (t.startsWith("the ")) t = t.substring(4);
        t = t.replaceAll("[^\\p{L}\\p{N}]", "");
        if (!t.isEmpty()) out.add(t);
    }

    private static final Pattern TITLE_NOISE = Pattern.compile(
            "^\\s*\\d{1,3}\\.\\s*|\\((?:[^)]*)\\)|\\[(?:[^\\]]*)\\]|\\s-\\s.*$|\\b(?:feat|ft)\\.?\\s.*$");

    /** 곡명 비교용 정규화: 괄호·"- ..."·feat. 꼬리를 떼고 글자/숫자만 남긴다. */
    public static String cleanTitle(String t) {
        if (t == null) return "";
        String x = TITLE_NOISE.matcher(t.toLowerCase(Locale.ROOT)).replaceAll(" ");
        return x.replaceAll("[^\\p{L}\\p{N}]", "");
    }

    /**
     * 곡명 유사도 0~1. a(Last.fm 곡명)가 "Han Georeum Deo한 걸음 더 (One More Step)"처럼 여러 표기가
     * 섞여 있으면 한글/영문/괄호 부분을 따로 b와 비교해 가장 높은 값을 쓴다.
     */
    public static double titleSimilarity(String a, String b) {
        if (a == null || b == null) return 0;
        double best = titleSim1(a, b);
        for (String part : titleParts(a)) {
            if (hasVariantMarker(part)) continue;   // "(Inst.)" 같은 버전 표기만으로 다른 곡과 매칭되는 것 방지
            best = Math.max(best, titleSim1(part, b));
        }
        return best;
    }

    /** 곡명을 표기별 조각으로 분리: 한글 덩어리, 영문 덩어리, 괄호 안. 조각이 원문과 같으면 제외. */
    public static java.util.List<String> titleParts(String t) {
        java.util.List<String> out = new java.util.ArrayList<>();
        if (t == null) return out;
        String lower = t.trim();
        Matcher h = Pattern.compile("[\\p{IsHangul}][\\p{IsHangul} ]*[\\p{IsHangul}]|[\\p{IsHangul}]").matcher(lower);
        if (hasHangul(lower) && hasLatin(lower)) {
            StringBuilder ko = new StringBuilder();
            while (h.find()) ko.append(h.group()).append(' ');
            String k = ko.toString().trim();
            if (!k.isEmpty()) out.add(k);
            String la = lower.replaceAll("\\([^)]*\\)", " ").replaceAll("[^\\p{IsLatin}0-9 .'\\-]", " ")
                    .replaceAll("\\s+", " ").trim();
            if (!la.isEmpty()) out.add(la);
        }
        Matcher m = PAREN.matcher(lower);
        while (m.find()) { String g = m.group(1).trim(); if (g.length() >= 2) out.add(g); }
        return out;
    }

    /** 후보가 instrumental/karaoke/MR 버전인데 찾는 곡명엔 그런 표시가 없으면 true (다른 버전이므로 제외). */
    private static final Pattern VARIANT = Pattern.compile("(?i)instrumental|karaoke|\\bMR\\b|inst\\.?(?![a-z])|off vocal|반주");

    /** 곡명에 inst/instrumental/karaoke/MR/반주 표기가 있으면 true. */
    public static boolean hasVariantMarker(String t) {
        return t != null && VARIANT.matcher(t).find();
    }

    public static boolean isUnwantedVariant(String wanted, String candidate) {
        if (candidate == null) return false;
        Pattern v = Pattern.compile("(?i)instrumental|karaoke|\\bMR\\b|inst\\.|off vocal|반주");
        return v.matcher(candidate).find() && !v.matcher(wanted == null ? "" : wanted).find();
    }

    private static double titleSim1(String a, String b) {
        String fa = a.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", "");
        String fb = b.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]", "");
        double best = Math.max(ratio(fa, fb), ratio(cleanTitle(a), cleanTitle(b)));
        String ca = cleanTitle(a), cb = cleanTitle(b);
        if (Math.min(ca.length(), cb.length()) >= 3 && (ca.contains(cb) || cb.contains(ca)))
            best = Math.max(best, 0.85);
        return best;
    }

    private static double ratio(String x, String y) {
        if (x.isEmpty() || y.isEmpty()) return 0;
        int maxLen = Math.max(x.length(), y.length());
        return (double) (maxLen - levenshtein(x, y)) / maxLen;
    }

    private static boolean hasHangul(String s) {
        return s.codePoints().anyMatch(c -> Character.UnicodeScript.of(c) == Character.UnicodeScript.HANGUL);
    }

    private static boolean hasLatin(String s) {
        return s.codePoints().anyMatch(c -> Character.UnicodeScript.of(c) == Character.UnicodeScript.LATIN);
    }

    /**
     * 한쪽은 한글뿐이고 다른 쪽은 영문뿐이라 이름 비교가 원천적으로 불가능한 경우
     * (예: 이준기 ↔ Lee Joon-gi). 이때는 곡명이 거의 같을 때만 같은 아티스트로 인정하도록
     * 호출 측에서 높은 곡명 유사도를 함께 요구한다.
     */
    public static boolean crossScript(String a, String b) {
        if (a == null || b == null) return false;
        return (hasHangul(a) && !hasHangul(b) && hasLatin(b))
                || (hasHangul(b) && !hasHangul(a) && hasLatin(a));
    }

    public static String normalizeArtist(String name) {
        String s = name.toLowerCase(Locale.ROOT).trim();
        if (s.startsWith("the ")) s = s.substring(4);
        // "케이윌 (K.Will)" 과 "K.Will" 이 같은 가수로 묶이도록, 영문 표기가 있으면 영문 글자만 키로 쓴다.
        String latin = s.replaceAll("[^a-z0-9]", "");
        if (!latin.isEmpty()) return latin;
        String k = s.replaceAll("[^\\p{L}\\p{N}]", "");
        return k.isEmpty() ? s : k;
    }

    /** Last.fm에 가끔 섞여 있는 인코딩 깨진 문자열(예: "ºÙ¹ÚÀÌ º°")인지 판별. */
    public static boolean looksGarbled(String t) {
        if (t == null || t.isEmpty()) return false;
        int hi = 0;
        for (int i = 0; i < t.length(); i++) { char c = t.charAt(i); if (c >= 0x80 && c <= 0xFF) hi++; }
        return hi >= 3 && hi * 4 >= t.length();
    }

    public static int levenshtein(String a, String b) {
        int m = a.length(), n = b.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 0; i <= m; i++) dp[i][0] = i;
        for (int j = 0; j <= n; j++) dp[0][j] = j;
        for (int i = 1; i <= m; i++)
            for (int j = 1; j <= n; j++)
                dp[i][j] = (a.charAt(i - 1) == b.charAt(j - 1))
                        ? dp[i - 1][j - 1]
                        : 1 + Math.min(dp[i - 1][j - 1],
                                Math.min(dp[i - 1][j], dp[i][j - 1]));
        return dp[m][n];
    }
}
