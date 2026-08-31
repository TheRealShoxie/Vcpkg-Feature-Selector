#include <iostream>

#ifdef VCPKG_FEATURE_SELECTOR_GUI
#include <imgui.h>
#endif

int main()
{
#ifdef VCPKG_FEATURE_SELECTOR_GUI
    ImGui::CreateContext();

    std::cout
        << "gui feature enabled, Dear ImGui version "
        << IMGUI_VERSION
        << '\n';

    ImGui::DestroyContext();
#else
    std::cout
        << "gui feature disabled\n";
#endif

    return 0;
}