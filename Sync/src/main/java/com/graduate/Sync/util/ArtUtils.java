package com.graduate.Sync.util;

import java.util.regex.Pattern;

/**
 * iTunes/Apple 아트 URL 해상도 업그레이드.
 *
 * 기존엔 곳곳에서 art.replace("100x100bb", "600x600bb") 처럼 "100x100"이 리터럴로
 * 박혀있다고 가정하고 문자열 치환을 했는데, iTunes가 100x100이 아닌 다른 해상도로
 * 내려줄 때(예: 60x60bb)는 이 치환이 조용히 실패해서 저화질 그대로 표시되는 문제가 있었다.
 * 정규식으로 "숫자x숫자bb" 패턴 자체를 찾아 치환하면 원본 해상도가 무엇이든 항상 동작한다.
 */
public final class ArtUtils {

    private ArtUtils() {}

    private static final Pattern RES_PATTERN = Pattern.compile("\\d+x\\d+bb");

    public static String hiResArt(String url, int size) {
        if (url == null) return null;
        return RES_PATTERN.matcher(url).replaceFirst(size + "x" + size + "bb");
    }
}
