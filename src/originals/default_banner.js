/*
Copyright(c) 2013-2018 Rhizome and Ilya Kreymer. Released under the GNU General Public License.

This file is part of pywb, https://github.com/webrecorder/pywb

    pywb is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    pywb is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with pywb.  If not, see <http://www.gnu.org/licenses/>.

*/

// Creates the default pywb banner.

(function () {
  function ts_to_date (ts, is_gmt) {
    if (!ts) {
      return '';
    }

    if (ts.length < 14) {
      ts += '00000000000000'.substr(ts.length);
    }

    var datestr = (ts.substring(0, 4) + '-' +
                      ts.substring(4, 6) + '-' +
                      ts.substring(6, 8) + 'T' +
                      ts.substring(8, 10) + ':' +
                      ts.substring(10, 12) + ':' +
                      ts.substring(12, 14) + '-00:00');

    var date = new Date(datestr);

    if (is_gmt) {
      return date.toGMTString();
    } else {
      return date.toLocaleString();
    }
  }

  function init (bid) {
    var banner = document.createElement('wb_div', true);

    banner.setAttribute('id', bid);
    banner.setAttribute('lang', 'en');

    var text = '';
    text += "<span id='_wb_capture_info'>Loading...</span>";

    banner.innerHTML = text;
    document.body.insertBefore(banner, document.body.firstChild);
  }

  function set_banner (url, ts, is_live, title) {
    var capture_str;
    var title_str;

    if (!ts) {
      return;
    }

    var date_str = ts_to_date(ts, true);

    if (title) {
      capture_str = title;
    } else {
      capture_str = url;
    }

    title_str = capture_str;
    capture_str = "<b id='title_or_url'>" + capture_str + '</b>';

    if (is_live) {
      title_str = ' pywb Live: ' + title_str;
      capture_str += '<i>Live on&nbsp;</i>';
    } else {
      title_str += 'pywb Archived: ' + title_str;
      capture_str += '<i>Archived on&nbsp;</i>';
    }

    title_str += ' (' + date_str + ')';
    capture_str += date_str;

    document.querySelector('#_wb_capture_info').innerHTML = capture_str;
    window.document.title = title_str;
  }

  if (window.top != window) {
    return;
  }

  var last_state = {};

  window.addEventListener('load', function () {
    if (window.wbinfo) {
      init('_wb_plain_banner');

      set_banner(window.wbinfo.url,
        window.wbinfo.timestamp,
        window.wbinfo.is_live,
        window.wbinfo.is_framed ? '' : document.title);
    } else {
      init('_wb_frame_top_banner');

      var state;
      var title = '';

      window.addEventListener('message', function (event) {
        var type = event.data.wb_type;

        if (type == 'load' || type == 'replace-url') {
          state = event.data;
          last_state = state;
          title = event.data.title || title;
        } else if (type == 'title') {
          state = last_state;
          title = event.data.title;
        } else {
          return;
        }

        // favicon update
        if (type === 'load') {
          var head = document.querySelector('head');
          var oldLink = document.querySelectorAll("link[rel*='icon']");
          for (var i = 0; i < oldLink.length; i++) {
            head.removeChild(oldLink[i]);
          }

          if (state.icons) {
            for (var i = 0; i < state.icons.length; i++) {
              var icon = state.icons[i];
              var link = document.createElement('link');
              link.rel = icon.rel;
              link.href = icon.href;
              head.appendChild(link);
            }
          }
        }

        set_banner(state.url, state.ts, state.is_live, title);
      });
    }
  });
})();
