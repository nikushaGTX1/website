# Velven game: reporting the floor to the website

The website gives a $50 cashback coupon when a logged-in player reaches **floor 30**.
The coupon is saved to the player's account and appears on the **My coupons** page.

The current build (`public/games/axali`) does not report the floor yet. Make the two changes
below in the Unity project, make a new WebGL build, and copy the files from its `Build` folder
over the files in `public/games/axali/Build`. Keep the same file names.

## 1. Add a JavaScript plugin

Create the file `Assets/Plugins/WebGL/VelvenBridge.jslib`:

```js
mergeInto(LibraryManager.library, {
  VelvenReportFloor: function (floor) {
    if (typeof window.VelvenReportFloor === 'function') window.VelvenReportFloor(floor);
  },
});
```

## 2. Call it when the floor changes

Call this from the script that updates the "Floor" counter, each time the floor goes up:

```csharp
using System.Runtime.InteropServices;
using UnityEngine;

public static class VelvenBridge
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern void VelvenReportFloor(int floor);
#endif

    public static void ReportFloor(int floor)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        VelvenReportFloor(floor);
#else
        Debug.Log($"Velven floor {floor}");
#endif
    }
}
```

For example: `VelvenBridge.ReportFloor(currentFloor);`

## How the website uses it

- `public/games/axali/index.html` defines `window.VelvenReportFloor`. It passes the floor to
  the `/play` page with `postMessage({ type: 'velven-game', floor })`.
- At floor 30, the `/play` page calls `POST /api/Coupons/game-reward`, and the API saves one
  coupon per account.
- A player who is not logged in is asked to log in. The win is kept in the browser, and the
  coupon is saved when they open My coupons after logging in.
- The reward floor is set in two places: `GameRewardFloor` in the API's `CouponsController`,
  and `GAME_REWARD_FLOOR` in `src/app/services/coupon.service.ts`. Change both together.
