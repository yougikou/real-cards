import re
from playwright.sync_api import sync_playwright

def test_host_table_deal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Assuming npm run preview or npm run dev is running locally, we will just use localhost:4173
        # In this script, we'll assume we can start a subprocess for the server if needed, or simply run dev in bash.

        # This script needs a running server
        # Let's write the test so it hits http://localhost:4173/#/host
        page.goto("http://localhost:4173/#/host")

        # Wait for "Host Not Ready" to appear, meaning Host UI loaded
        # Although actually it connects to PeerJS automatically. We can wait for "Host Connected"
        page.wait_for_selector("text=Host Connected", timeout=10000)

        # We also want to verify the deck count is 54
        page.wait_for_selector("text=54")

        # Deal a card by triggering the table events through JS if playwright drag-and-drop is flaky
        # or we can simulate drag and drop on the canvas.
        # But wait, we don't have clients connected so we can't fully drop to a valid user.
        # Let's test the return path: dropping on invalid spot

        canvas = page.locator("canvas")
        # Click and drag the top deck card roughly at center
        box = canvas.bounding_box()
        center_x = box["x"] + box["width"] / 2
        center_y = box["y"] + box["height"] / 2

        # Move mouse to center, press, move away, release
        page.mouse.move(center_x + 5, center_y - 5)
        page.mouse.down()
        page.mouse.move(center_x + 100, center_y - 100, steps=10)

        # While dragging, the card is popped.
        # Wait a tiny bit then release
        page.wait_for_timeout(500)
        page.mouse.up()

        # After release in empty space, card should tween back and return
        # Wait for tween to finish
        page.wait_for_timeout(1000)

        # Deck should still be 54 (popped then returned)
        page.wait_for_selector("text=54", timeout=5000)

        browser.close()

if __name__ == "__main__":
    test_host_table_deal()
