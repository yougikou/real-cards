import os
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on('dialog', lambda dialog: dialog.accept())

        print("Navigating to http://localhost:4173/#/?preview=true")
        page.goto("http://localhost:4173/#/?preview=true")

        page.wait_for_timeout(2000)

        url = page.url
        print(f"Current URL after navigation: {url}")

        content = page.content()
        if "Your Hand" in content:
            print("Successfully loaded Client Preview UI!")
        elif "Real Cards Sandbox" in content:
            print("Error: Loaded Home screen instead of Client Preview UI")
        else:
            print("Unknown screen loaded")

        browser.close()

if __name__ == "__main__":
    run()
