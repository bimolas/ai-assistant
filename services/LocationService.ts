import { Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { historyService } from "./historyService";

export class LocationService {
 
    
  private onStatusUpdate?: (message: string) => void;
  private onSpeak?: (text: string, options?: { rate?: number; pitch?: number }) => Promise<void>;
  
  constructor(
    onStatusUpdate?: (message: string) => void,
    onSpeak?: (text: string, options?: { rate?: number; pitch?: number }) => Promise<void>
  ) {
    this.onStatusUpdate = onStatusUpdate;
    this.onSpeak = onSpeak;
  }

  async handleWhereAmI(): Promise<string | void> {
    this.onStatusUpdate?.("Processing location...");
    let finalAddress = "";
    try {
      let Location: typeof import("expo-location");
      try {
        Location = require("expo-location");
      } catch (e) {
        await this.onSpeak?.("Location services are not available on this device.");
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        await this.onSpeak?.(
          "I need location permission to tell you where you are."
        );
        return;
      }

      let coords;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        coords = loc.coords;
      } catch (e) {
        await this.onSpeak?.("I couldn't determine your current location.");
        return;
      }

      try {
        const lat = coords.latitude;
        const lon = coords.longitude;
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
        const axios = require("axios");
        let response;
        try {
          response = await axios.get(url, {
            headers: {
              "User-Agent": "YoRHa2B/1.0 (samielmourtazak@gmail.com)",
            },
            validateStatus: () => true, 
          });
        } catch (err: any) {
          this.onStatusUpdate?.(
            `Network error: ${err && err.message ? err.message : err}`
          );
          await this.onSpeak?.("I could not reach the location service.");
          return;
        }

        if (response.status === 403) {
          this.onStatusUpdate?.(
            "Nominatim API returned 403 Forbidden. You may be rate-limited or missing a required User-Agent header. Try again later."
          );
          await this.onSpeak?.(
            "Location service is temporarily unavailable due to rate limits. Please try again later."
          );
          return;
        }
        if (response.status !== 200) {
          this.onStatusUpdate?.(
            `Geocoding failed with status ${response.status}: ${response.statusText}`
          );
          await this.onSpeak?.(
            "I could not determine your address due to a service error."
          );
          return;
        }

        const address = response.data.address;
        if (!address) {
          if (response.data.display_name) {
            finalAddress = response.data.display_name;
            await this.onSpeak?.(`You are at ${finalAddress}.`, { pitch: 1.2 });
            this.onStatusUpdate?.(`You are at ${finalAddress}.`);
            try {
              await historyService.addWithResponse("where am I", finalAddress);
            } catch {}
            return finalAddress;
          } else {
            await this.onSpeak?.("I could not determine your address.");
            this.onStatusUpdate?.("No address found in geocoding response.");
            return;
          }
        }

        const getField = (...fields: string[]) => {
          for (const f of fields) {
            if (address[f]) return address[f];
          }
          return "";
        };

        const road = getField("road", "cycleway", "pedestrian", "footway");
        const city = getField("city", "town", "village");
        const suburb = getField("suburb", "neighbourhood");
        const state = address.state || "";
        const country = address.country || "";
        const postcode = address.postcode || "";

        let parts: string[] = [];
        if (road) parts.push(road);
        if (suburb) parts.push(suburb);
        if (city) parts.push(city);
        if (state) parts.push(state);
        if (postcode) parts.push(postcode);
        if (country) parts.push(country);

        if (parts.length === 0 && response.data.display_name) {
          finalAddress = response.data.display_name;
          await this.onSpeak?.(`You are at ${finalAddress}.`, { pitch: 1.2 });
          this.onStatusUpdate?.(`You are at ${finalAddress}.`);
          try {
            await historyService.addWithResponse("where am I", finalAddress);
          } catch {}
          return finalAddress;
        }

        finalAddress = parts.join(", ");
        if (finalAddress) {
          const responseText = `You are at ${finalAddress}.`;
          await this.onSpeak?.(responseText, { pitch: 1.2 });
          this.onStatusUpdate?.(responseText);
          try {
            await historyService.addWithResponse("where am I", responseText);
          } catch {}
        } else {
          const debugMsg = `Unable to construct address. Raw: ${JSON.stringify(
            response.data
          )}`;
          this.onStatusUpdate?.(debugMsg);
          await this.onSpeak?.("I could not determine your address.");
        }
        return finalAddress;
      } catch (e: any) {
        if (coords) {
          this.onStatusUpdate?.(
            `Reverse geocoding failed. ${e && e.message ? e.message : e}`
          );
          await this.onSpeak?.(
            "I know where you are, but I can't describe the address."
          );
        } else {
          await this.onSpeak?.("I can't access your location.");
        }
      }
    } catch (e: any) {
      await this.onSpeak?.("I couldn't determine your current location.");
    }
    return finalAddress;
  }
}