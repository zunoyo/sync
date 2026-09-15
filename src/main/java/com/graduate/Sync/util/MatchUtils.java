package com.graduate.Sync.util;

import java.util.Locale;

/**
 * 검색 결과의 아티스트 이름이 실제로 찾던 아티스트와 같은지 검증하는 공용 유틸.
 * Spotify/iTunes 검색은 텍스트 유사도로 대충 맞는 결과를 반환하는 경우가 많아서,
 * 엉뚱한 동명이인/유사명 아티스트를 그대로 보여주지 않도록 오매칭을 걸러낸다.
 */
public final class MatchUtils {

    private MatchUtils() {}

    public static boolean artistMatches(String a, String b) {
        if (a == null || b == null) return false;
        String na = normalizeArtist(a);
        String nb = normalizeArtist(b);
        if (na.isEmpty() || nb.isEmpty()) return false;
        if (na.equals(nb)) return true;
        // 이름이 짧을수록 Levenshtein 비율이 부정확해짐(예: 3~4글자에서 1글자만 달라도
        // threshold를 넘어버림) — 더 짧은 쪽이 4자 미만이면 정확히 일치할 때만 인정
        if (Math.min(na.length(), nb.length()) < 4) return false;
        int maxLen = Math.max(na.length(), nb.length());
        double similarity = (double) (maxLen - levenshtein(na, nb)) / maxLen;
        return similarity >= 0.80;
    }

    public static String normalizeArtist(String name) {
        String s = name.toLowerCase(Locale.ROOT).trim();
        return s.startsWith("the ") ? s.substring(4) : s;
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
