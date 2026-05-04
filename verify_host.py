from playwright.sync_api import sync_playwright
import time
import os

def run():
    os.makedirs("/home/jules/verification", exist_ok=True)
    with sync_playwright() as p:
        # Use landscape viewport as instructed by memory for Host UI
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        # Route to the host view
        page.goto("http://localhost:5173/#/host")

        # Wait for the Host room to initialize (status ready)
        # It should say "Room ID: "
        page.wait_for_selector("text=Room ID: ", timeout=10000)

        # Wait for the phaser canvas to be ready
        time.sleep(2)

        # Get the room id
        room_text = page.locator("text=Room ID: ").inner_text()
        room_id = room_text.replace("Room ID: ", "").strip()
        print(f"Host Room ID: {room_id}")

        # Open a client context to connect
        client_context = browser.new_context(viewport={"width": 375, "height": 812})
        client_page = client_context.new_page()
        client_page.goto(f"http://localhost:5173/#/client/{room_id}?name=TestPlayer")

        # Wait for client to connect
        time.sleep(3)

        # Now back to host page.
        # Click the phaser deck to draw to table? No, we need to click the deck to pop a card.
        # But wait, deck is in Phaser, so we can't easily click it via HTML.
        # Actually, in the host view, maybe we can click the "deck" via pointerdown?
        # Let's just dispatch an event to draw a card to the table, so we have a card in the playStack.
        page.evaluate("window.dispatchEvent(new Event('host-draw-to-table'))")
        time.sleep(0.5)

        # Take a screenshot to show the UI with public cards
        page.screenshot(path="/home/jules/verification/host_ui.png")
        print("Screenshot saved to /home/jules/verification/host_ui.png")

        browser.close()

if __name__ == "__main__":
    run()
