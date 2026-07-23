// @vitest-environment jsdom

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { BottomNavBar } from "@/components/website/BottomNavBar";

const mockSetDrawerOpen = vi.fn();
const mockSetNavMenuOpen = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("next-view-transitions", () => ({
  Link: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/contexts/LayoutContext", () => ({
  useLayout: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    useReducedMotion: () => false,
  };
});

import { usePathname } from "next/navigation";
import { useLayout } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";

function setupMocks(
  pathname: string,
  layoutOverrides: Record<string, unknown> = {},
  authOverrides: Record<string, unknown> = {}
) {
  (usePathname as unknown as ReturnType<typeof vi.fn>).mockReturnValue(pathname);
  (useLayout as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    isDrawerOpen: false,
    setDrawerOpen: mockSetDrawerOpen,
    isNavMenuOpen: false,
    setNavMenuOpen: mockSetNavMenuOpen,
    isDrawerAnimating: false,
    ...layoutOverrides,
  });
  (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    activeModal: null,
    userCenterOpen: false,
    ...authOverrides,
  });
}

describe("BottomNavBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the main navigation landmark", () => {
    setupMocks("/");
    render(<BottomNavBar />);

    expect(screen.getByRole("navigation", { name: "主要导航" })).toBeInTheDocument();
  });

  it("renders desktop navigation links", () => {
    setupMocks("/");
    render(<BottomNavBar />);

    const desktopNav = screen.getByTestId("desktop-nav-list");
    expect(within(desktopNav).getByRole("link", { name: /首页/i })).toBeInTheDocument();
    expect(within(desktopNav).getByRole("link", { name: /产品系列/i })).toBeInTheDocument();
    // "品牌故事" 在桌面端左侧独立区域渲染
    expect(screen.getByRole("link", { name: /品牌故事/i })).toBeInTheDocument();
  });

  it("marks the current desktop page with aria-current", () => {
    setupMocks("/products");
    render(<BottomNavBar />);

    const desktopNav = screen.getByTestId("desktop-nav-list");
    const productsLink = within(desktopNav).getByRole("link", { name: /产品系列/i });
    expect(productsLink).toHaveAttribute("aria-current", "page");
  });

  it("does not mark inactive desktop pages with aria-current", () => {
    setupMocks("/products");
    render(<BottomNavBar />);

    const desktopNav = screen.getByTestId("desktop-nav-list");
    const homeLink = within(desktopNav).getByRole("link", { name: /首页/i });
    expect(homeLink).not.toHaveAttribute("aria-current");
  });

  it("opens the drawer when clicking the current page desktop link", () => {
    setupMocks("/products");
    render(<BottomNavBar />);

    const desktopNav = screen.getByTestId("desktop-nav-list");
    const productsLink = within(desktopNav).getByRole("link", { name: /产品系列/i });
    fireEvent.click(productsLink);

    expect(mockSetDrawerOpen).toHaveBeenCalledWith(true);
  });

  it("renders the mobile primary navigation for the current page", () => {
    setupMocks("/products");
    render(<BottomNavBar />);

    const mobilePrimary = screen.getByTestId("mobile-primary-nav");
    expect(mobilePrimary).toHaveAttribute("aria-current", "page");
    expect(within(mobilePrimary).getByText("产品系列")).toBeInTheDocument();
  });

  it("toggles the mobile menu and exposes aria-expanded", () => {
    setupMocks("/", { isNavMenuOpen: false });
    render(<BottomNavBar />);

    const menuButton = screen.getByTestId("mobile-menu-button");
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    expect(menuButton).toHaveAttribute("aria-controls", "mobile-nav-menu");

    fireEvent.click(menuButton);
    expect(mockSetNavMenuOpen).toHaveBeenCalledWith(true);
  });

  it("shows the mobile menu popup when open", () => {
    setupMocks("/", { isNavMenuOpen: true });
    render(<BottomNavBar />);

    const menuPopup = screen.getByTestId("mobile-nav-menu");
    expect(menuPopup).toBeInTheDocument();
    expect(menuPopup).toHaveAttribute("id", "mobile-nav-menu");
  });

  it("hides the navigation when a modal is active", () => {
    setupMocks("/", {}, { activeModal: "login" });
    const { container } = render(<BottomNavBar />);

    expect(container.querySelector("nav")).not.toBeInTheDocument();
  });

  it("hides the navigation on product detail pages", () => {
    setupMocks("/products/123");
    const { container } = render(<BottomNavBar />);

    expect(container.querySelector("nav")).not.toBeInTheDocument();
  });

  it("hides the navigation on standalone pages like services", () => {
    setupMocks("/services");
    const { container } = render(<BottomNavBar />);

    // 独立全屏页面整体不渲染底部导航
    expect(container.querySelector("nav")).not.toBeInTheDocument();
  });
});
