/*
 * Convert clojure instaql_query to JSON format for javascript
 * This is useful for pasting queries from honeycomb into the dashboard inspector
 *
 * Usage
 * 1) Copy `instaql_query` from a honeycomb trace
 * 2) Paste it into this tool and click `Convert`
 * 3) Paste the output into the dashboard query inspector
 * */

import { useState } from 'react';

type JsonObject = { [key: string]: any };

const inputPlaceholder = `{:universes {:stickers {}, :$ {:where {:id "4203b2fc-5077-4c77-a682-935960e99bcf"}}}}`;
const outputPlaceholder = `{
  "universes": {
    "stickers": {},
    "$": {
      "where": {
        "id": "4203b2fc-5077-4c77-a682-935960e99bcf"
      }
    }
  }
}`;

function convertToJson(inputStr: string): JsonObject {
  const jsonStr = inputStr
    .replace(/(:\S+)/g, '"$1"') // Wrap clojure keys with quotes
    .replace(/"(:([^"\s]+))"/g, '"$2":'); // Move colon to the end
  return JSON.parse(jsonStr);
}

const ConvertPage: React.FC = () => {
  const [input, setInput] = useState<string>('');
  const [output, setOutput] = useState<string>('');

  console.log(input, output);

  const handleConvert = () => {
    try {
      const converted = convertToJson(input);
      setOutput(JSON.stringify(converted, null, 2));
    } catch (e) {
      setOutput('Invalid Clojure-like input');
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 space-y-2">
        <p>
          Use this tool for running <b>clojure queries from honeycomb</b> in the{' '}
          <b>JSON dashboard query inspector</b>
        </p>
        <div>
          <p className="my-2">Intended usage:</p>
          <code>
            <li>1. Copy an `instaql_query` from a honeycomb trace</li>
            <li>2. Paste it into this tool and click `Convert`</li>
            <li>3. Paste the output into the dashboard query inspector</li>
          </code>
        </div>
      </div>
      <div className="flex flex-col md:w-1/2">
        <div>
          <textarea
            className="w-full"
            rows={10}
            cols={50}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={inputPlaceholder}
          />
        </div>
        <div className="my-4">
          <button
            className="bg-black text-white p-2 flex"
            onClick={handleConvert}
          >
            Convert
          </button>
        </div>
        <div className="relative">
          <textarea
            className="w-full"
            rows={10}
            cols={50}
            value={output}
            readOnly
            placeholder={outputPlaceholder}
          />
        </div>
      </div>
    </div>
  );
};

export default ConvertPage;
