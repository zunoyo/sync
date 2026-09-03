package com.graduate.Sync.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.web.servlet.HandlerInterceptor;

public class LoginInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request,
                             HttpServletResponse response,
                             Object handler) throws Exception {

        HttpSession session = request.getSession(false);

        if (session == null || session.getAttribute("loginUser") == null) {

            String uri = request.getRequestURI();

            // API 요청 → 401 반환 (JSON 클라이언트가 처리)
            if (uri.startsWith("/api/")) {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"error\":\"로그인이 필요합니다.\"}");
                return false;
            }

            // 페이지 요청 → /login 리다이렉트
            response.sendRedirect("/login");
            return false;
        }
        return true;
    }
}
