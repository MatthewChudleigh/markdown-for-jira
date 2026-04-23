modules:
  jira:issueContext:
    - key: markdown-for-jira-panel
      resource: main
      resolver:
        function: resolver
      title: Markdown attachments                                                                                                                                                                             
      label: Markdown attachments   
      icon: https://developer.atlassian.com/platform/forge/images/icons/issue-panel-icon.svg
  function:
    - key: resolver
      handler: index.handler

resources:
  - key: main
    path: static/panel/dist
    tunnel:
      port: 5173

app:
  runtime:
    name: nodejs22.x
  id: ari:cloud:ecosystem::app/<FORGE_APP_ID>

permissions:
  scopes:
    - read:jira-work
